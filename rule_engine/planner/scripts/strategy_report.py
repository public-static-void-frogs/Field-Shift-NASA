"""Summarise strategy_check.py: the plan's 2021-2023 sequences against the neighbours' and the field's own.

    python rule_engine/planner/scripts/strategy_report.py data/local/planner/strategy/strategy.jsonl

Per field: the plan's value is the probability-weighted realised cash of its sequences (only the
priced ones, renormalised); "beats" is the share of the neighbours whose own sequence, priced on
this field, earned less than the plan; followers are the neighbours whose sequence is one of the
plan's with probability 0.1 or more. "Observed" keeps the sequences whose three yields are all
observed county or state yields, not the model's.
"""

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

GROUPS = {
    "alfalfa in the West": lambda r, s: (
        "alfalfa" in s and r["region"] in {"AZ", "CA", "NV", "NM", "UT", "WA", "CO", "ID", "OR"}
    ),
    "alfalfa elsewhere": lambda r, s: "alfalfa" in s,
    "potatoes": lambda r, s: "potatoes" in s,
    "rice": lambda r, s: "rice" in s,
    "Corn Belt corn/soy": lambda r, s: r["region"] in {"IA", "IL", "IN", "OH", "MN", "NE", "MO"},
    "other": lambda r, s: True,
}


def group(row, crops: set[str]) -> str:
    return next(name for name, test in GROUPS.items() if test(row, crops))


def summarise(row: dict, observed: bool) -> dict | None:
    priced = row["realised"]
    if observed:
        priced = {k: v for k, v in priced.items() if all(m == "observed" for m in v["modes"])}
    plan = {s: p for s, p in row["plan"].items() if s in priced}
    mass = sum(plan.values())
    if mass < 0.5:  # most of the plan cannot be priced (a crop without a realised yield)
        return None
    value = sum(p * priced[s]["cash"] for s, p in plan.items()) / mass
    neighbours = {s: n for s, n in row["neighbours"].items() if s in priced}
    total = sum(neighbours.values())
    if total == 0:
        return None
    cash = {s: priced[s]["cash"] for s in neighbours}
    follow = {s for s, p in row["plan"].items() if p >= 0.1}
    followers = [(cash[s], n) for s, n in neighbours.items() if s in follow]
    others = [(cash[s], n) for s, n in neighbours.items() if s not in follow]

    def mean(pairs):
        return sum(c * n for c, n in pairs) / sum(n for _, n in pairs) if pairs else None

    return {
        "plan": value,
        "neighbours": mean(list(zip(cash.values(), neighbours.values()))),
        "best neighbour": max(cash.values()),
        "farmer": priced[row["farmer"]]["cash"] if row["farmer"] in priced else None,
        "beats": sum(n for s, n in neighbours.items() if cash[s] < value) / total,
        "followers": mean(followers),
        "others": mean(others),
        "follower share": sum(n for _, n in followers) / total,
        "n": total,
        "priced": total / sum(row["neighbours"].values()),
    }


def report(rows: list[dict], observed: bool) -> None:
    by = defaultdict(list)
    for row in rows:
        result = summarise(row, observed)
        if result is None:
            continue
        crops = {c for s in row["plan"] for c in s.split("|")}
        result["group"] = group(row, crops)
        by["all"].append(result)
        by[result["group"]].append(result)
    title = "observed yields only" if observed else "all priced sequences"
    print(f"\n## {title} (USD/acre over 2021-2023, constant dollars)\n")
    print(
        "| Plans with | Fields | Plan | Neighbours | Farmer | Best neighbour"
        " | Plan beats | Followers | Others | Both | Followers win | Neighbours priced |"
    )
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for name in ["all", *GROUPS]:
        results = by.get(name, [])
        if not results:
            continue

        def avg(key, rs=results):
            values = [r[key] for r in rs if r[key] is not None]
            return np.mean(values) if values else float("nan")

        both = [r for r in results if r["followers"] is not None and r["others"] is not None]
        wins = np.mean([r["followers"] > r["others"] for r in both]) if both else float("nan")
        print(
            f"| {name} | {len(results)} | {avg('plan'):,.0f} | {avg('neighbours'):,.0f}"
            f" | {avg('farmer'):,.0f} | {avg('best neighbour'):,.0f} | {avg('beats'):.0%}"
            f" | {avg('followers', both):,.0f} | {avg('others', both):,.0f} | {len(both)}"
            f" | {wins:.0%} | {avg('priced'):.0%} |"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("results", nargs="+", type=Path)
    args = parser.parse_args()
    rows = {}  # two machines may both have run a field where their halves met
    for path in args.results:
        for r in map(json.loads, path.open()):
            if r.get("status") == "ok":
                rows[r["fieldId"]] = r
    rows = list(rows.values())
    print(f"{len(rows)} fields planned")
    for observed in (False, True):
        report(rows, observed)


if __name__ == "__main__":
    main()
