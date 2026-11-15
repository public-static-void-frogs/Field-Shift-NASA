"""Regional production costs from the USDA ERS commodity costs and returns tables.

    python rule_engine/planner/scripts/build_regional_costs.py --ers <folder with the ERS csv files>

The files are the "recent" cost-and-returns tables per commodity (corn.csv, soybeans.csv,
wheat.csv, sorghum.csv, oats.csv, barley.csv, cotton.csv, rice.csv, peanuts.csv) from
https://www.ers.usda.gov/data-products/commodity-costs-and-returns. Writes
rule_engine/planner/data/costs_regional.csv: for each crop and ERS farm resource region, the
latest year's "Total, costs listed" less "Opportunity cost of land", in USD per planted acre.
That is the same cost concept as the ISU budgets in costs.csv (machinery and labour included,
land excluded). ERS reports wheat as one commodity; the same row serves winter, spring and durum wheat (NDSU's
2026 North Dakota durum budgets, 234-304 USD/acre without land and labour, are a check). Cotton is
upland cotton with cottonseed in the gross value; the planner values lint only.

Also writes costs_regional_history.csv: the same figure for every year in the files (about
1995-2025, nominal dollars, ERS farm resource regions) with the main cost components, yield, price
and gross value of production.

With --historical <folder of the ERS "historical" .xls files> it also writes
costs_early_history.csv: the years before the recent tables start (1975 to the mid 1990s, later
for barley, oats and rice). Those accounts are a different scheme: the whole U.S. and a few broad
regions instead of the farm resource regions, and "total economic costs" under the older ERS
method. The cost column is that total less land, the closest match to the recent figure, but the
two series do not overlap and should not be read as one. Needs the xlrd package.
"""

import argparse
import csv
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "costs_regional.csv"
FILES = {
    "corn": ("corn",),
    "soybeans": ("soybeans",),
    "wheat": ("winter_wheat", "spring_wheat", "durum_wheat"),
    "sorghum": ("sorghum",),
    "oats": ("oats",),
    "barley": ("barley",),
    "cotton": ("cotton",),
    "rice": ("rice",),
    "peanuts": ("peanuts",),
}
OUT_HISTORY = OUT.with_name("costs_regional_history.csv")
COMPONENTS = {
    "seed": "Seed",
    "fertilizer": "Fertilizer",
    "chemicals": "Chemicals",
    "fuel_lube_electricity": "Fuel, lube, and electricity",
    "repairs": "Repairs",
    "custom_operations": "Custom services",
    "hired_labor": "Hired labor",
    "unpaid_labor_opportunity": "Opportunity cost of unpaid labor",
    "machinery_capital_recovery": "Capital recovery of machinery and equipment",
    "land_opportunity": "Opportunity cost of land",
    "gross_value": "Total, gross value of production",
}
URL = "https://www.ers.usda.gov/data-products/commodity-costs-and-returns"
OUT_EARLY = OUT.with_name("costs_early_history.csv")
# first word of the historical file name -> planner crops (the ERS name where not modelled yet)
EARLY_CROPS = FILES
EARLY_SCHEME = "ERS historical accounts: total economic costs less land, broad regions"


def early_history(folder: Path) -> list[list]:
    """Rows of the historical workbooks: one sheet per region, years across, two tables down.

    The second table of each sheet holds the economic (full ownership) costs."""
    import xlrd

    out = []
    for path in sorted(folder.glob("*.xls")):
        crops = EARLY_CROPS[path.name.split("_")[0]]
        for sheet in xlrd.open_workbook(path).sheets():
            rows = [sheet.row_values(r) for r in range(sheet.nrows)]
            headers = [
                r
                for r, row in enumerate(rows)
                if sum(isinstance(v, float) and 1970 < v < 2010 for v in row) > 5
            ]
            years = {c: int(v) for c, v in enumerate(rows[headers[1]]) if isinstance(v, float)}
            found: dict[str, list] = {}
            for row in rows[headers[1] :]:
                label = str(row[0]).strip().lower()
                for name, starts in (
                    ("total", ("total, economic", "subtotal")),
                    ("land", ("land",)),
                    ("gross", ("total, gross value",)),
                    ("price", ("harvest-period price",)),
                    ("yield", ("yield",)),
                ):
                    if label.startswith(starts):
                        found.setdefault(name, row)
            region = sheet.name.rsplit(" ", 1)[0].replace("US", "U.S. total")
            units = str(found["yield"][0]).strip()
            for column, year in sorted(years.items()):
                total, land = found["total"][column], found["land"][column]
                if not isinstance(total, float) or not isinstance(land, float):
                    continue
                source = f"USDA ERS Commodity Costs and Returns, historical, {path.name}"
                values = [f"{total - land:.2f}", f"{land:.2f}"]
                values += [found[k][column] for k in ("gross", "yield", "price")]
                for crop in crops:
                    out.append([crop, region, year, *values, units, EARLY_SCHEME, source, URL])
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--ers", required=True)
    parser.add_argument("--historical", type=Path)
    args = parser.parse_args()
    out = []
    history = []
    for name, crops in FILES.items():
        with (Path(args.ers) / f"{name}.csv").open(newline="", encoding="latin1") as handle:
            rows = list(csv.DictReader(handle))
        year = max(int(r["Year"]) for r in rows)
        by_year: dict[tuple[str, int], dict[str, str]] = {}
        for r in rows:
            cell = by_year.setdefault((r["Region"], int(r["Year"])), {})
            cell[r["Item"].strip(), r["Units"]] = r["Value"]
        found: dict[str, dict[str, float]] = {}
        for r in rows:
            if int(r["Year"]) == year and r["Units"] == "dollars per planted acre":
                found.setdefault(r["Region"], {})[r["Item"].strip()] = float(r["Value"])
        for region, items in sorted(found.items()):
            total, land = items["Total, costs listed"], items["Opportunity cost of land"]
            for crop in crops:
                source = (
                    f"USDA ERS Commodity Costs and Returns, {name}, {region}, {year}: "
                    f"total costs listed {total:.2f} less opportunity cost of land {land:.2f}"
                )
                # one ERS wheat table stands in for both wheat classes
                verified = "false" if name == "wheat" else "true"
                out.append([crop, region, f"{total - land:.2f}", year, verified, source, URL])
        for (region, y), cell in sorted(by_year.items()):
            dollars = {k[0]: v for k, v in cell.items() if k[1] == "dollars per planted acre"}
            if "Total, costs listed" not in dollars or "Opportunity cost of land" not in dollars:
                continue
            total, land = (
                float(dollars["Total, costs listed"]),
                float(dollars["Opportunity cost of land"]),
            )
            crop_yield = next((v for k, v in cell.items() if k[0] == "Yield"), "")
            price = next((v for k, v in cell.items() if k[0] == "Price"), "")
            parts = [dollars.get(item, "") for item in COMPONENTS.values()]
            source = f"USDA ERS Commodity Costs and Returns, {name}, {region}, {y}"
            for crop in crops:
                head = [crop, region, y, f"{total - land:.2f}"]
                history.append([*head, *parts, crop_yield, price, source, URL])
    with OUT.open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["crop", "region", "usd_per_acre", "year", "verified", "source", "url"])
        writer.writerows(out)
    with OUT_HISTORY.open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(
            [
                "crop",
                "region",
                "year",
                "usd_per_acre",
                *COMPONENTS,
                "yield",
                "price",
                "source",
                "url",
            ]
        )
        writer.writerows(history)
    print(f"wrote {OUT}: {len(out)} rows")
    print(f"wrote {OUT_HISTORY}: {len(history)} rows")
    if args.historical:
        early = early_history(args.historical)
        with OUT_EARLY.open("w", newline="") as handle:
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(
                [
                    "crop",
                    "region",
                    "year",
                    "usd_per_acre",
                    "land_opportunity",
                    "gross_value",
                    "yield",
                    "price",
                    "yield_units",
                    "scheme",
                    "source",
                    "url",
                ]  # fmt: skip
            )
            writer.writerows(early)
        print(f"wrote {OUT_EARLY}: {len(early)} rows")


if __name__ == "__main__":
    main()
