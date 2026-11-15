"""Apply the potato and rice gates of model.py to tables built before them, without a rebuild.

    python rule_engine/planner/scripts/gate_tables.py \
        --tables data/local/planner/tables_usa_v5 --out data/local/planner/tables_usa_v6 \
        --irrigation data/local/planner/irrigation/irrigation_v3.parquet

A crop the gates now exclude (tables.needs_irrigation on a field that is not irrigated, or a
county outside processor_counties for a field that never grew the crop) loses its actions at
every node and its per-crop inputs. Every other reward is unchanged, because a crop's reward
does not depend on which other crops are offered. One difference remains against a rebuild: a
field with more than MAX_CROPS usable crops would plan the next crop of its state in the freed
slot, and here the slot stays empty. A field left with fewer than two crops is dropped, as
build_tables.py does.
"""

import argparse
import math
import pickle
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from rule_engine.planner import tabular  # noqa: E402
from rule_engine.planner.irrigation import field_status  # noqa: E402
from rule_engine.planner.tables import CROPS, needs_irrigation, processor_counties  # noqa: E402


def gate(table, status: str | None, processors) -> list[str]:
    """Mask the crops the gates exclude, in place; returns their names."""
    history = {CROPS[k] for k in table.node_history[0] if k < len(CROPS)}
    dropped = []
    for slot, index in enumerate(table.crops):
        if index < 0:
            continue
        crop = CROPS[index]
        blocked = needs_irrigation(crop, table.region) and status != "irrigated"
        blocked |= (
            crop in processors and table.county not in processors[crop] and crop not in history
        )
        if not blocked:
            continue
        dropped.append(crop)
        table.mask[:, tabular.SLOT == slot] = False
        table.crops[slot] = -1
        start = 2 * len(tabular.STATIC_NAMES) + 3 * index
        table.statics[start : start + 3] = 0.0
    return dropped


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--tables", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--irrigation", required=True, type=Path)
    args = parser.parse_args()
    frame = pd.read_parquet(args.irrigation, columns=["field_id", "year", "irrigated", "source"])
    status = {k: v["status"] for k, v in field_status(frame).items()}
    processors = processor_counties()
    args.out.mkdir(parents=True, exist_ok=True)
    counts, kept, removed = Counter(), 0, 0
    for path in sorted(args.tables.glob("tables_*.pkl")):
        with path.open("rb") as handle:
            shard = pickle.load(handle)
        out = []
        for table in shard:
            dropped = gate(table, status.get(table.field_id), processors)
            counts.update(f"{c} {table.region}" for c in dropped)
            if (table.crops >= 0).sum() < 2:
                removed += 1
                continue
            if dropped:  # every reachable node keeps an allowed action
                assert math.isfinite(tabular.score(table)[0]), table.field_id
            out.append(table)
        kept += len(out)
        with (args.out / path.name).open("wb") as handle:
            pickle.dump(out, handle, protocol=pickle.HIGHEST_PROTOCOL)
    print(f"{kept} tables kept, {removed} dropped with fewer than two crops")
    for key, n in counts.most_common(25):
        print(f"  {key}: {n}")


if __name__ == "__main__":
    main()
