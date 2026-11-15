"""Tabulate the planning problem of every sample field (see planner/tabular.py), in parallel.

    python rule_engine/planner/scripts/build_tables.py \
        --fields data/local/usa_sample/fields.jsonl \
        --summaries data/local/usa_sample/season_summary data/local/planner/season_summary \
        --out data/local/planner/tables --workers 14

Fields are processed in a fixed random order and written in shards of `--shard` fields
(`tables_0000.pkl`, ...), so a partial run is still a random sample. Fields where fewer than two
crops can be modelled are skipped: there is nothing to decide.

Optional inputs merged into each field record before it is modelled:
    --irrigation    scripts/fetch_irrigation.py table -> record["irrigation"] (irrigation.py)
    --greenness     scripts/fetch_modis_greenness.py yearly.parquet -> record["greenness"]:
                    mean and spread of the field's yearly peak NDVI
    --soil-extra    CSVs keyed by mukey (FieldSense soil_extra.csv: NCCPI; this repo's
                    scripts/fetch_soil_profile.py: slope length, bulk density) -> record["soil"]
    --rule-engine   another checkout's rule_engine package (its catalog, rules and data) to model
                    with; the planner stays this one
"""

import argparse
import csv
import importlib.util
import pickle
import random
import sys
import time
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _use_rule_engine(argv: list[str]) -> None:
    """Import `rule_engine` from --rule-engine, and `rule_engine.planner` from this repo."""
    if "--rule-engine" not in argv:
        sys.path.insert(0, str(ROOT))
        return
    package = Path(argv[argv.index("--rule-engine") + 1]).resolve()
    sys.path.insert(0, str(package.parent))
    import rule_engine

    if Path(rule_engine.__file__).resolve().parent != package:
        raise SystemExit(f"rule_engine imported from {rule_engine.__file__}, not {package}")
    planner = ROOT / "rule_engine" / "planner"
    spec = importlib.util.spec_from_file_location(
        "rule_engine.planner", planner / "__init__.py", submodule_search_locations=[str(planner)]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["rule_engine.planner"] = module
    rule_engine.planner = module
    spec.loader.exec_module(module)


_use_rule_engine(sys.argv)

from rule_engine import build_advisor  # noqa: E402
from rule_engine.planner import (  # noqa: E402
    RotationModel,
    build_context,
    read_fields,
    state_reference_aws,
)
from rule_engine.planner.irrigation import field_status  # noqa: E402
from rule_engine.planner.prices import PLAN_YEAR  # noqa: E402
from rule_engine.planner.tabular import tabulate  # noqa: E402

SHARED: dict = {}
NUMERIC_SOIL = ("nccpi_all", "nccpi_corn", "nccpi_soy", "nccpi_small_grains", "slope_length_m",
                "bulk_density_g_cm3", "aws_150cm_mm")  # fmt: skip


def enrich(fields: dict[str, dict], args) -> None:
    """Merge the optional per-field inputs into the records, in place, and report coverage."""
    import pandas as pd

    if args.irrigation:
        frame = pd.read_parquet(
            args.irrigation, columns=["field_id", "year", "irrigated", "source"]
        )
        frame = frame[frame["field_id"].isin(fields.keys())]
        status = field_status(frame)
        for field_id, value in status.items():
            fields[field_id]["irrigation"] = value
        irrigated = sum(v["status"] == "irrigated" for v in status.values())
        print(f"irrigation: {len(status)} fields, {irrigated} irrigated", flush=True)
    if args.greenness:
        frame = pd.read_parquet(args.greenness, columns=["field_id", "year", "ndvi_peak"])
        frame = frame[frame["field_id"].isin(fields.keys())]
        stats = frame.groupby("field_id")["ndvi_peak"].agg(["mean", "std", "count"])
        for field_id, row in stats[stats["count"] >= 5].iterrows():
            fields[str(field_id)]["greenness"] = {
                "ndvi_peak_mean": round(float(row["mean"]), 3),
                "ndvi_peak_std": round(float(row["std"]), 3),
                "years": int(row["count"]),
                "source": "NASA MOD13Q1 v6.1 NDVI, 250 m pixel at the centroid",
            }
        print(f"greenness: {int((stats['count'] >= 5).sum())} fields", flush=True)
    for path in args.soil_extra or ():
        with Path(path).open(newline="") as handle:
            table = {r["mukey"]: r for r in csv.DictReader(handle)}
        merged = 0
        for record in fields.values():
            soil = record.get("soil")
            row = table.get(str((soil or {}).get("mukey")))
            if row is None:
                continue
            merged += 1
            for key in NUMERIC_SOIL:
                if row.get(key) not in (None, ""):
                    soil[key] = float(row[key])
        print(f"soil extra {Path(path).name}: {merged} fields", flush=True)


def work(field_id: str):
    record = SHARED["fields"][field_id]
    try:
        context = build_context(
            record,
            SHARED["advisor"],
            SHARED["summaries"],
            SHARED["reference"].get(record.get("stateFips")),
            plan_year=SHARED["plan_year"],
        )
        model = RotationModel(context, SHARED["advisor"], horizon=SHARED["horizon"])
        if len(model.crops) < 2:
            return field_id, "fewer_than_two_crops", None
        return field_id, "ok", tabulate(model)
    except Exception as error:  # one bad field must not stop the run
        return field_id, f"error: {type(error).__name__}: {error}"[:120], None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fields", required=True)
    parser.add_argument("--summaries", nargs="+", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--horizon", type=int, default=5)
    parser.add_argument("--shard", type=int, default=500)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--irrigation", type=Path)
    parser.add_argument("--greenness", type=Path)
    parser.add_argument("--soil-extra", nargs="+", type=Path)
    parser.add_argument("--rule-engine", type=Path, help="rule_engine package to model with")
    parser.add_argument(
        "--part",
        default="1/1",
        help="K/N: build every N-th field from the K-th, to split one build across machines",
    )
    parser.add_argument(
        "--plan-year",
        type=int,
        default=PLAN_YEAR,
        help="first planted year; only what was known in the autumn before it is used (0: everything)",
    )
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    fields = read_fields(args.fields)
    enrich(fields, args)
    SHARED.update(
        fields=fields,
        advisor=build_advisor(),
        summaries=args.summaries,
        reference=state_reference_aws(fields),
        horizon=args.horizon,
        plan_year=args.plan_year or None,
    )
    ids = sorted(fields)
    random.Random(0).shuffle(ids)
    ids = ids[: args.limit] if args.limit else ids
    part, parts = (int(x) for x in args.part.split("/"))
    ids = ids[part - 1 :: parts]
    prefix = "tables_" if parts == 1 else f"tables_p{part}of{parts}_"

    status: Counter = Counter()
    shard, written, started = [], 0, time.time()

    def flush() -> None:
        nonlocal shard, written
        if shard:
            with (out / f"{prefix}{written:04d}.pkl").open("wb") as handle:
                pickle.dump(shard, handle, protocol=pickle.HIGHEST_PROTOCOL)
            written += 1
            shard = []

    with Pool(args.workers) as pool:  # fork: the workers share the loaded fields and advisor
        for done, (_, state, table) in enumerate(pool.imap_unordered(work, ids, 8), 1):
            status[state.split(":")[0] if state.startswith("error") else state] += 1
            if state.startswith("error") and status["error"] <= 5:
                print(state, flush=True)
            if table is not None:
                shard.append(table)
                if len(shard) >= args.shard:
                    flush()
            if done % 250 == 0:
                rate = done / (time.time() - started)
                print(f"{done}/{len(ids)} fields, {rate:.1f}/s, {dict(status)}", flush=True)
    flush()
    print(f"done: {dict(status)}, {written} shards in {out}")


if __name__ == "__main__":
    main()
