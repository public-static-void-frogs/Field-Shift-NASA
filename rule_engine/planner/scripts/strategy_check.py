"""Did real fields that followed the planner's three-year strategy earn more than those that did not?

    python rule_engine/planner/scripts/strategy_check.py \
        --fields data/local/usa_sample_v2/fields.jsonl \
        --summaries data/local/usa_sample_v2/work/season_summary \
        --irrigation data/local/planner/irrigation/irrigation_v3.parquet \
        --soil-extra ../FieldSense/data/local/usa_sample_v3/soil_extra.csv \
                     data/local/planner/soil/mukey_profile.csv \
        --pool ../FieldSense/data/local/usa_sample_v3 \
        --rule-engine ../FieldSense/rule_engine \
        --sample 1200 --part 1/2 --out data/local/planner/strategy/strategy_p1.jsonl

For each sampled field the plan is made as in the autumn of 2020 (as in hindcast_fields.py: CDL
from 2021 hidden, trend yields through 2020, prices known then). The optimal policy of the
field's table gives the probability of each three-year crop sequence for 2021-2023, since later
choices depend on the years drawn. The neighbours are the fields of 25 acres or more in the same
county that grew the same crop in 2020 (FieldSense usa_sample_v3; CDL labels, satellite
estimates). Each crop sequence that the plan or the neighbours followed, and the field's own, is
then priced on this field over 2021-2023 as it turned out: the observed county (else state)
yield of each year, the field's rotation and establishment effects from the rule model, the
realized marketing-year price in constant dollars, and the year's budget cost. All sequences use
the same tillage and cover per crop (the planner's best for its first year), so they differ by
crop only. Costs are budgets, not farm records.
"""

import argparse
import json
import random
import sys
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_tables as bt  # noqa: E402  (imports rule_engine from --rule-engine)
import hindcast_fields as hf  # noqa: E402

from rule_engine import build_advisor  # noqa: E402
from rule_engine.planner import (  # noqa: E402
    RotationModel,
    build_context,
    read_fields,
    state_reference_aws,
    tabular,
)
from rule_engine.planner.dynamics import Action, shift  # noqa: E402
from rule_engine.planner.irrigation import field_status  # noqa: E402

START, YEARS = 2021, (2021, 2022, 2023)
SHARED: dict = {}


def _init(summaries, reference, pool) -> None:
    SHARED.update(advisor=build_advisor(), summaries=summaries, reference=reference, pool=pool)


def plan_paths(table, taken, steps: int) -> dict[tuple[str, ...], float]:
    """Probability of each crop sequence of the first `steps` years under the policy `taken`."""
    actions = table.global_actions
    mass = {(0, table.first, ()): 1.0}
    for _ in range(steps):
        following: dict = defaultdict(float)
        for (node, year, seq), m in mass.items():
            a = taken[node, year]
            child = int(table.next_node[node, tabular.SLOT[a]])
            crop = tabular.ACTIONS[actions[a]].crop
            for nxt in np.flatnonzero(table.odds[year] > 1e-9):
                following[(child, int(nxt), seq + (crop,))] += m * float(table.odds[year, nxt])
        mass = following
    out: dict = defaultdict(float)
    for (_, _, seq), m in mass.items():
        out[seq] += m
    return dict(out)


def one(record: dict) -> dict:
    advisor = SHARED["advisor"]
    props = record.get("sourceProperties") or {}
    row = {"fieldId": record["id"], "countyFips": record.get("countyFips")}

    def crop_of(year):
        code = props.get(f"CDL{year}")
        crop = advisor.catalog.by_cdl(int(code)) if code not in (None, "") else None
        return crop.id if crop else None

    hidden = hf.hidden_after(record, START)
    reference = SHARED["reference"].get(record.get("stateFips"))
    context = build_context(hidden, advisor, SHARED["summaries"], reference, plan_year=START)
    row.update(region=context.region, irrigated=None)
    try:
        model = RotationModel(context, advisor)
        outcome = {}
        for y in YEARS:
            seen = build_context(hidden, advisor, SHARED["summaries"], reference, trend_year=y)
            outcome[y] = RotationModel(seen, advisor)
    except ValueError as error:
        return row | {"status": "error", "error": str(error)}
    if model.chain is None or model.chain.labels[model.chain.latest] != START - 1:
        return row | {"status": "year_not_drawable"}
    own = {}
    for y in YEARS:
        drawn = [d.year for d in outcome[y].years]
        if y not in drawn:
            return row | {"status": "year_not_drawable"}
        own[y] = drawn.index(y)
    table = tabular.tabulate(model)
    _, taken = tabular.score(table)
    odds = table.odds[model.chain.latest]
    practice: dict[str, tuple[str, str]] = {}
    best: dict[str, float] = {}
    for a in np.flatnonzero(table.mask[0]):
        action = tabular.ACTIONS[table.global_actions[a]]
        value = float(table.reward[0, a] @ odds)
        if action.crop not in best or value > best[action.crop]:
            best[action.crop] = value
            practice[action.crop] = (action.tillage, action.cover)
    plan = plan_paths(table, taken, len(YEARS))
    prev = crop_of(START - 1)
    farmer = tuple(crop_of(y) for y in YEARS)
    # the pool may hold this field too: one count among many, not removed
    neighbours = SHARED["pool"].get((str(record.get("countyFips")).zfill(5), prev), Counter())
    start_history = model.initial_state.history

    def realised(seq):
        history, total, years, modes = start_history, 0.0, [], []
        for y, crop in zip(YEARS, seq):
            if crop is None or crop not in practice or crop not in outcome[y].crops:
                return None
            o = outcome[y]._base_outcomes(history, Action(crop, *practice[crop]))[own[y]]
            price = hf.realized_price(crop, record, context.region, y)
            cash = o.yield_per_acre * (o.price if price is None else price) - o.cost - o.erosion
            total += cash
            years.append(round(cash, 1))
            modes.append(o.detail["yieldMode"])
            history = shift(history, crop)
        return {"cash": round(total, 1), "years": years, "modes": modes}

    sequences = set(plan) | set(neighbours) | {farmer}
    priced = {}
    for seq in sequences:
        value = realised(seq)
        if value is not None:
            priced["|".join(seq)] = value
    return row | {
        "status": "ok",
        "irrigated": bool(model.irrigated),
        "crops": list(model.crops),
        "previous": prev,
        "farmer": "|".join(c or "other" for c in farmer),
        "plan": {"|".join(s): round(p, 4) for s, p in plan.items() if p >= 1e-3},
        "neighbours": {"|".join(c or "other" for c in s): n for s, n in neighbours.items()},
        "realised": priced,
    }


def neighbour_pool(root: Path, advisor) -> dict:
    """{(county, crop of 2020): Counter of 2021-2023 crop sequences} of fields of 25 acres or more."""
    import duckdb

    rows = duckdb.sql(
        f"""
        SELECT f.STATEFIPS || f.CNTYFIPS AS county, c.CDL2020, c.CDL2021, c.CDL2022, c.CDL2023
        FROM read_csv('{root}/fields.csv', all_varchar=true) f
        JOIN read_parquet('{root}/cdl_history_all.parquet') c USING (CSBID)
        WHERE f.CSBACRES::DOUBLE >= 25
        """
    ).fetchall()
    ids: dict = {}

    def crop(code):
        if code is None:
            return None
        if code not in ids:
            found = advisor.catalog.by_cdl(int(code))
            ids[code] = found.id if found else None
        return ids[code]

    pool: dict = defaultdict(Counter)
    for county, *codes in rows:
        crops = [crop(c) for c in codes]
        if crops[0] is not None:
            pool[(county, crops[0])][tuple(crops[1:])] += 1
    return dict(pool)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fields", required=True, type=Path)
    parser.add_argument("--summaries", nargs="+", required=True)
    parser.add_argument("--irrigation", type=Path)
    parser.add_argument("--soil-extra", nargs="*", type=Path, default=[])
    parser.add_argument("--pool", required=True, type=Path)
    parser.add_argument("--rule-engine", type=Path)
    parser.add_argument("--sample", type=int, default=1200)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--part", default="1/1")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--reverse", action="store_true", help="from the end, for a second machine")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    args.greenness = None
    irrigation, args.irrigation = args.irrigation, None
    fields = read_fields(args.fields)
    bt.enrich(fields, args)
    ids = sorted(fields)
    random.Random(args.seed).shuffle(ids)  # the same sample as hindcast_fields.py
    k, n = map(int, args.part.split("/"))
    sample = ids[: args.sample][k - 1 :: n][:: -1 if args.reverse else 1]
    status = {}
    if irrigation:
        import pandas as pd

        frame = pd.read_parquet(irrigation, columns=["field_id", "year", "irrigated", "source"])
        status = field_status(frame[frame["field_id"].isin(set(sample)) & (frame["year"] < START)])
    pool = neighbour_pool(args.pool.resolve(), build_advisor())
    print(f"{len(sample):,} fields, {len(pool):,} county x crop neighbour groups", flush=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    jobs = [{**fields[i], "irrigation": status.get(i)} for i in sample]
    initargs = (args.summaries, state_reference_aws(fields), pool)
    with (
        args.out.open("w") as handle,
        ProcessPoolExecutor(args.workers, initializer=_init, initargs=initargs) as workers,
    ):
        for m, row in enumerate(workers.map(one, jobs, chunksize=2), start=1):
            handle.write(json.dumps(row) + "\n")
            if m % 50 == 0:
                handle.flush()
                print(f"  {m}/{len(jobs)}", flush=True)


if __name__ == "__main__":
    main()
