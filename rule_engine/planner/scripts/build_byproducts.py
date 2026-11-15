"""Value of a crop's by-product relative to its main product, from the USDA ERS cost tables.

    python rule_engine/planner/scripts/build_byproducts.py --ers data/local/planner/ers

The planner prices cotton by its lint, but ERS counts cottonseed in cotton's gross value and its
costs include ginning, which the seed usually pays for. Writes rule_engine/planner/data/byproducts.csv:
per ERS farm resource region, the mean over the years of the ERS "recent" table of
cottonseed value / (gross value - cottonseed value). The planner multiplies the lint price by
1 + that share. The share moves with the seed and lint prices of each year (about 0.12-0.41);
the mean is used for every drawn year.
"""

import argparse
import csv
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "byproducts.csv"
URL = "https://www.ers.usda.gov/data-products/commodity-costs-and-returns"
ITEMS = {
    "cotton": ("cotton.csv", "Secondary product, cottonseed", "cottonseed"),
}
GROSS = "Total, gross value of production"


def shares(path: Path, item: str) -> dict[str, list[tuple[int, float]]]:
    with path.open(newline="", encoding="latin1") as handle:
        rows = list(csv.DictReader(handle))
    cells: dict[tuple[str, int], dict[str, float]] = defaultdict(dict)
    for r in rows:
        if r["Item"] in (item, GROSS):
            try:
                cells[(r["Region"], int(r["Year"]))][r["Item"]] = float(r["Value"])
            except ValueError:
                continue
    out: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for (region, year), cell in sorted(cells.items()):
        if item in cell and cell.get(GROSS, 0) > cell[item] > 0:
            out[region].append((year, cell[item] / (cell[GROSS] - cell[item])))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--ers", required=True, type=Path)
    args = parser.parse_args()
    lines = []
    for crop, (name, item, product) in ITEMS.items():
        for region, values in sorted(shares(args.ers / name, item).items()):
            years = [y for y, _ in values]
            mean = sum(v for _, v in values) / len(values)
            source = (
                f"USDA ERS Commodity Costs and Returns, {crop}, {region}, {min(years)}-{max(years)}:"
                f" mean of '{item}' / ('{GROSS}' less it)"
            )
            lines.append([crop, product, region, f"{mean:.4f}", len(values), source, URL])
    with OUT.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["crop", "product", "region", "value_share", "years", "source", "url"])
        writer.writerows(lines)
    print(f"{len(lines)} rows -> {OUT}")


if __name__ == "__main__":
    main()
