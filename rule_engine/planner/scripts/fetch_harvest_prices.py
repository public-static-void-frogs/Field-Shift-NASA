"""US monthly prices received at harvest, from USDA NASS Quick Stats (Agricultural Prices).

    python rule_engine/planner/scripts/fetch_harvest_prices.py

Needs USDA_DATA_KEY in .env or the environment. Writes rule_engine/planner/data/
harvest_prices.csv (crop, year, month, value, unit) with the national September and October
prices received of every crop of fetch_long_history.SERIES that NASS reports monthly.

A marketing-year price is known only after the marketing year ends (August of the next year
for corn), so it cannot be what a farmer sees when planning the next crop in November. The
harvest-month prices are: NASS publishes the October price at the end of October. chance.py
uses them as the price signal of the year just experienced.
"""

import csv
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_long_history import API, SERIES, START_YEAR, _key  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "data" / "harvest_prices.csv"
MONTHS = ("SEP", "OCT")


def fetch(key: str, short_desc: str) -> list[tuple[int, str, float]]:
    query = {
        "key": key,
        "format": "JSON",
        "short_desc": short_desc,
        "freq_desc": "MONTHLY",
        "domain_desc": "TOTAL",
        "source_desc": "SURVEY",
        "year__GE": str(START_YEAR),
        "agg_level_desc": "NATIONAL",
    }
    try:
        with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(query)}", timeout=120) as resp:
            rows = json.load(resp)["data"]
    except urllib.error.HTTPError as error:  # 400 = no data for the query
        print(f"  NASS returned {error.code} for {short_desc}")
        return []
    out = []
    for row in rows:
        month = row["reference_period_desc"]
        text = row["Value"].replace(",", "").strip()
        if month in MONTHS and re.fullmatch(r"-?\d+(\.\d+)?", text):
            out.append((int(row["year"]), month, float(text)))
    return out


def main() -> None:
    key = _key()
    rows = []
    for kind, crop, short_desc, _, unit, factor in SERIES:
        if kind != "price":
            continue
        found = fetch(key, short_desc)
        years = [y for y, _, _ in found]
        print(f"{crop}: {len(found)} values, {min(years, default=0)}-{max(years, default=0)}")
        for year, month, value in sorted(found):
            rows.append([crop, year, month.lower(), round(value * factor, 4), unit])
    with OUT.open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["crop", "year", "month", "value", "unit"])
        writer.writerows(rows)
    print(f"wrote {OUT}: {len(rows)} rows")


if __name__ == "__main__":
    main()
