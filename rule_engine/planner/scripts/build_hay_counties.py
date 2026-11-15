"""Counties where hay is grown: planner/data/hay_counties.csv.

Alfalfa is sold as hay, mostly within trucking distance (dairies, feedlots, horse owners), and
needs haying equipment. The planner offers it only in a county listed here, or on a field whose
own history shows it, the way processor_counties.csv limits sugarbeets and potatoes. A county is
listed when alfalfa and other hay (CDL 36 and 37) hold at least --min-share of the sampled CSB
acres there, averaged over 2021-2025 (CDL labels: a satellite estimate).

    python rule_engine/planner/scripts/build_hay_counties.py \
        --root ../FieldSense/data/local/usa_sample_v3
"""

import argparse
import csv
from pathlib import Path

import duckdb

OUT = Path(__file__).resolve().parents[1] / "data" / "hay_counties.csv"
HAY = (36, 37)  # CDL alfalfa, other hay / non-alfalfa
YEARS = range(2021, 2026)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--min-share", type=float, default=0.01)
    args = parser.parse_args()
    root = args.root.resolve()
    seasons = " UNION ALL ".join(
        f"SELECT CSBID, CDL{y} AS cdl FROM read_parquet('{root}/cdl_history_all.parquet')"
        for y in YEARS
    )
    codes = ", ".join(str(c) for c in HAY)
    rows = duckdb.sql(
        f"""
        WITH f AS (SELECT CSBID, STATEFIPS || CNTYFIPS AS county, CSBACRES::DOUBLE AS acres
                   FROM read_csv('{root}/fields.csv', all_varchar=true)),
             s AS (SELECT county, cdl, acres FROM ({seasons}) JOIN f USING (CSBID)),
             total AS (SELECT county, sum(acres) AS acres FROM s GROUP BY county)
        SELECT s.county, sum(s.acres) / any_value(total.acres) AS share
        FROM s JOIN total USING (county) WHERE s.cdl IN ({codes})
        GROUP BY s.county HAVING share >= {args.min_share}
        ORDER BY s.county
        """
    ).fetchall()
    source = (
        f"CDL {YEARS[0]}-{YEARS[-1]} alfalfa and other hay on the sampled CSB fields ({root.name}):"
        f" share of the county's sampled acres >= {args.min_share}"
    )
    with OUT.open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["crop", "county_fips", "acre_share", "source"])
        for county, share in rows:
            writer.writerow(["alfalfa", county, round(share, 4), source])
    print(f"{len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
