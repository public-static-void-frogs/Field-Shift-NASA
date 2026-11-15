"""What the planner would have chosen on real fields in past years, for validate_against_fields.py.

    python rule_engine/planner/scripts/hindcast_fields.py \
        --fields data/local/usa_sample_v2/fields.jsonl \
        --summaries data/local/usa_sample_v2/work/season_summary \
        --irrigation data/local/planner/irrigation/irrigation_v3.parquet \
        --soil-extra ../FieldSense/data/local/usa_sample_v3/soil_extra.csv \
                     data/local/planner/soil/mukey_profile.csv \
        --rule-engine ../FieldSense/rule_engine \
        --years 2021 2022 2023 --sample 1500 --out data/local/planner/validation/hindcast.jsonl

For each sampled field and outcome year Y the plan is made as in the autumn of Y-1
(FieldContext.plan_year = Y): the field's CDL labels from Y on are hidden, no season from Y on is
drawn, the irrigation status uses the satellite maps before Y only, yields are the trend through
Y-1, and prices are what was known then (marketing years through Y-2, the September price of
Y-1; prices.py). The yearly odds start after Y-1. Each row holds:
    plannerCrop   the first crop of the exact optimum of the field's table (tabular.score),
                  which the trained policy approximates
    farmerCrop    the crop CDL shows in Y (a satellite estimate, not a farmer record)
    expected      per crop, the best expected first-year reward of its actions under the odds
                  after Y-1 (soil term included), USD/acre
    expectedCash  for that action, its expected revenue - cost - soil loss charge (no risk
                  penalty, no soil carbon), USD/acre
    hindcast      per crop and that best action, the outcome of year Y itself, from a second
                  model that sees Y: yield (the observed county or state yield, else the rule
                  model's), the realized marketing-year price of Y in constant dollars of the
                  latest CPI year, cost (with the year's cost shift), rule yield factor

Still not ex ante: the cost budgets are the current ones moved by the year's cost index, the
satellite crop and soil layers are today's, and USDA price outlooks are on file only for the
live plan (price_outlook.csv), so the hindcast's expected prices are the persistence forecast
from the September price of Y-1. Resumable: (field, year) pairs already in --out are skipped.
"""

import argparse
import json
import random
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_tables as bt  # noqa: E402  (imports rule_engine from --rule-engine)

from rule_engine import build_advisor  # noqa: E402
from rule_engine.planner import (  # noqa: E402
    RotationModel,
    build_context,
    read_fields,
    state_reference_aws,
    tabular,
)
from rule_engine.planner.irrigation import field_status  # noqa: E402
from rule_engine.planner.prices import cpi, cpi_of  # noqa: E402
from rule_engine.planner.sampler import _history_rows, _series  # noqa: E402
from rule_engine.planner.tables import byproduct_share, ers_region  # noqa: E402

SHARED: dict = {}


def _init(summaries, reference) -> None:
    SHARED.update(advisor=build_advisor(), summaries=summaries, reference=reference)


def hidden_after(record: dict, year: int) -> dict:
    props = {
        k: v
        for k, v in (record.get("sourceProperties") or {}).items()
        if not (k.startswith("CDL") and k[3:].isdigit() and int(k[3:]) >= year)
    }
    return {**record, "sourceProperties": props}


def realized_price(crop: str, record: dict, region: str, year: int) -> float | None:
    """The marketing-year price of `year` in the field's state (else the US), in constant dollars
    of the latest CPI year, with the by-product share the model adds (cottonseed)."""
    history, _, _ = _series(_history_rows(), "price", crop, region)
    if year not in history:
        return None
    share = byproduct_share(crop, ers_region(record.get("countyFips")))
    return history[year] * cpi()[max(cpi())] / cpi_of(year) * (1.0 + (share[1] if share else 0.0))


def one(job: tuple[dict, int]) -> dict:
    record, year = job
    advisor = SHARED["advisor"]
    farmer_code = (record.get("sourceProperties") or {}).get(f"CDL{year}")
    farmer = advisor.catalog.by_cdl(int(farmer_code)) if farmer_code not in (None, "") else None
    row = {
        "fieldId": record["id"],
        "year": year,
        "stateFips": record.get("stateFips"),
        "countyFips": record.get("countyFips"),
        "farmerCdl": farmer_code,
        "farmerCrop": farmer.id if farmer else None,
    }
    hidden = hidden_after(record, year)
    reference = SHARED["reference"].get(record.get("stateFips"))
    context = build_context(hidden, advisor, SHARED["summaries"], reference, plan_year=year)
    # the outcome of Y: every season, the yield trend at Y, so a drawn Y is the observed Y
    seen = build_context(hidden, advisor, SHARED["summaries"], reference, trend_year=year)
    row.update(region=context.region, history=list(context.history))
    try:
        model = RotationModel(context, advisor)
        outcome_model = RotationModel(seen, advisor)
    except ValueError as error:
        return row | {"status": "error", "error": str(error)}
    if model.chain is None or model.chain.labels[model.chain.latest] != year - 1:
        return row | {"status": "year_not_drawable"}
    drawn = [y.year for y in outcome_model.years]
    if year not in drawn:
        return row | {"status": "year_not_drawable"}
    start, own = model.chain.latest, drawn.index(year)
    table = tabular.tabulate(model)
    _, taken = tabular.score(table)
    odds = table.odds[start]
    best: dict[str, tuple[float, int]] = {}
    for a in np.flatnonzero(table.mask[0]):
        crop = tabular.ACTIONS[table.global_actions[a]].crop
        value = float(table.reward[0, a] @ odds)
        if crop not in best or value > best[crop][0]:
            best[crop] = (value, int(a))
    hindcast, cash = {}, {}
    for crop, (_, a) in best.items():
        action = tabular.ACTIONS[table.global_actions[a]]
        outcomes = model._base_outcomes(model.initial_state.history, action)
        cash[crop] = round(
            float(sum(p * (o.revenue - o.cost - o.erosion) for p, o in zip(odds, outcomes))), 2
        )
        if crop not in outcome_model.crops:
            continue
        outcome = outcome_model._base_outcomes(model.initial_state.history, action)[own]
        price = realized_price(crop, record, context.region, year)
        hindcast[crop] = {
            "action": [action.tillage, action.cover],
            "yield": round(outcome.yield_per_acre, 3),
            "price": round(outcome.price if price is None else price, 4),
            "priceSource": "model draw" if price is None else "marketing year, constant dollars",
            "expectedPrice": round(model.sampler.basis[crop].price, 4),
            "cost": round(outcome.cost, 2),
            "erosion": round(outcome.erosion, 2),
            "risk": round(outcome.risk, 2),
            "ruleYieldFactor": outcome.detail["ruleYieldFactor"],
            "yieldMode": outcome.detail["yieldMode"],
        }
    chosen = tabular.ACTIONS[table.global_actions[taken[0, start]]]
    return row | {
        "status": "ok",
        "crops": list(model.crops),
        "irrigated": bool(model.irrigated),
        "plannerCrop": chosen.crop,
        "plannerAction": [chosen.tillage, chosen.cover],
        "myopicCrop": max(best, key=lambda c: best[c][0]),
        "expected": {c: round(v, 2) for c, (v, _) in best.items()},
        "expectedCash": cash,
        "hindcast": hindcast,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fields", required=True, type=Path)
    parser.add_argument("--summaries", nargs="+", required=True)
    parser.add_argument("--irrigation", type=Path)
    parser.add_argument("--soil-extra", nargs="*", type=Path, default=[])
    parser.add_argument("--rule-engine", type=Path)
    parser.add_argument("--years", nargs="+", type=int, default=[2021, 2022, 2023])
    parser.add_argument("--sample", type=int, default=1500)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    args.greenness = None
    irrigation, args.irrigation = args.irrigation, None  # per outcome year, below
    fields = read_fields(args.fields)
    bt.enrich(fields, args)
    ids = sorted(fields)
    random.Random(args.seed).shuffle(ids)
    done = set()
    if args.out.exists():
        with args.out.open() as handle:
            done = {(r["fieldId"], r["year"]) for r in map(json.loads, handle)}
    sample = set(ids[: args.sample])
    status: dict[int, dict] = {y: {} for y in args.years}
    if irrigation:
        import pandas as pd

        frame = pd.read_parquet(irrigation, columns=["field_id", "year", "irrigated", "source"])
        frame = frame[frame["field_id"].isin(sample)]
        for y in args.years:  # the maps a farmer had before Y
            status[y] = field_status(frame[frame["year"] < y])
    jobs = [
        ({**fields[i], "irrigation": status[y].get(i)}, y)
        for i in ids[: args.sample]
        for y in args.years
        if (i, y) not in done
    ]
    print(f"{len(jobs):,} field-years to hindcast", flush=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    initargs = (args.summaries, state_reference_aws(fields))
    with (
        args.out.open("a") as handle,
        ProcessPoolExecutor(args.workers, initializer=_init, initargs=initargs) as pool,
    ):
        for n, row in enumerate(pool.map(one, jobs, chunksize=4), start=1):
            handle.write(json.dumps(row) + "\n")
            if n % 100 == 0:
                handle.flush()
                print(f"  {n}/{len(jobs)}", flush=True)


if __name__ == "__main__":
    main()
