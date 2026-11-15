"""Counties where hay or rice is grown: planner/data/hay_counties.csv and rice_counties.csv.

Alfalfa is sold as hay, mostly within trucking distance (dairies, feedlots, horse owners), and
needs haying equipment. Rice needs levelled, levee-bound paddies on soils that hold a flood,
water rights and a mill. The planner offers either only in a county listed here, or on a field
whose own history shows it, the way processor_counties.csv limits sugarbeets and potatoes. A
county is listed when the crop's CDL classes (alfalfa and other hay, 36 and 37; rice, 3) hold at
least the crop's minimum share of the sampled CSB acres there, averaged over 2021-2025 (CDL
labels: a satellite estimate).

    python rule_engine/planner/scripts/build_hay_counties.py \
        --root ../FieldSense/data/local/usa_sample_v3 [--crop rice]
"""

import argparse
import csv
from pathlib import Path

import duckdb

DATA = Path(__file__).resolve().parents[1] / "data"
# crop: CDL classes, minimum share of the county's sampled acres, output file, what is counted
GROUPS = {
    "alfalfa": ((36, 37), 0.01, "hay_counties.csv", "alfalfa and other hay"),
    "rice": ((3,), 0.005, "rice_counties.csv", "rice"),
}
YEARS = range(2021, 2026)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--crop", choices=sorted(GROUPS), default="alfalfa")
    parser.add_argument("--min-share", type=float)
    args = parser.parse_args()
    codes, min_share, name, label = GROUPS[args.crop]
    min_share = args.min_share if args.min_share is not None else min_share
    root = args.root.resolve()
    seasons = " UNION ALL ".join(
        f"SELECT CSBID, CDL{y} AS cdl FROM read_parquet('{root}/cdl_history_all.parquet')"
        for y in YEARS
    )
    listed = ", ".join(str(c) for c in codes)
    rows = duckdb.sql(
        f"""
        WITH f AS (SELECT CSBID, STATEFIPS || CNTYFIPS AS county, CSBACRES::DOUBLE AS acres
                   FROM read_csv('{root}/fields.csv', all_varchar=true)),
             s AS (SELECT county, cdl, acres FROM ({seasons}) JOIN f USING (CSBID)),
             total AS (SELECT county, sum(acres) AS acres FROM s GROUP BY county)
        SELECT s.county, sum(s.acres) / any_value(total.acres) AS share
        FROM s JOIN total USING (county) WHERE s.cdl IN ({listed})
        GROUP BY s.county HAVING share >= {min_share}
        ORDER BY s.county
        """
    ).fetchall()
    source = (
        f"CDL {YEARS[0]}-{YEARS[-1]} {label} on the sampled CSB fields ({root.name}):"
        f" share of the county's sampled acres >= {min_share}"
    )
    out = DATA / name
    with out.open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["crop", "county_fips", "acre_share", "source"])
        for county, share in rows:
            writer.writerow([args.crop, county, round(share, 4), source])
    print(f"{len(rows)} rows -> {out}")


if __name__ == "__main__":
    main()
