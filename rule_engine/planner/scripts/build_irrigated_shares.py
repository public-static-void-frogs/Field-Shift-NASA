"""Irrigated share of each ERS crop's harvested acres in each ERS cost region (Census 2022).

    python rule_engine/planner/scripts/build_irrigated_shares.py

Needs USDA_DATA_KEY in .env or the environment. Writes rule_engine/planner/data/irrigated_shares.csv
(crop, region, irrigated_acres, harvested_acres, share, coverage, ...).

ERS Commodity Costs and Returns average irrigated and dryland farms, so a regional budget already
holds `share` of an irrigated acre's cost. tables.CostTable.irrigation_cost adds the rest on an
irrigated field and takes the share off a dryland one.

County rows of the 2022 Census of Agriculture, summed over the counties of the crop's ERS region
(tables.crop_region, so rice and peanuts use their own regions). A county without an irrigated
row has no irrigated acres; a county whose irrigated or harvested acres are withheld (D) is left
out of both sums, and `coverage` is the share of the region's disclosed harvested acres kept.
"""

import csv
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "rule_engine" / "scripts"))
sys.path.insert(0, str(ROOT))
from fetch_nass_reference import API, _key  # noqa: E402
from rule_engine.planner.tables import NATIONAL, crop_region, ers_region  # noqa: E402

OUT = ROOT / "rule_engine" / "planner" / "data" / "irrigated_shares.csv"
SERIES = {  # crop: Census short_desc of all harvested acres; the irrigated one inserts IRRIGATED
    "corn": "CORN, GRAIN",
    "soybeans": "SOYBEANS",
    "winter_wheat": "WHEAT, WINTER",
    "spring_wheat": "WHEAT, SPRING, (EXCL DURUM)",
    "durum_wheat": "WHEAT, SPRING, DURUM",
    "sorghum": "SORGHUM, GRAIN",
    "barley": "BARLEY",
    "oats": "OATS",
    "cotton": "COTTON",
    "peanuts": "PEANUTS",
    "rice": "RICE",
}


def fetch(key: str, short_desc: str) -> dict[str, tuple[str, float | None]]:
    """{county FIPS: (state, acres or None when withheld)}."""
    query = {
        "key": key,
        "format": "JSON",
        "source_desc": "CENSUS",
        "year": "2022",
        "agg_level_desc": "COUNTY",
        "short_desc": f"{short_desc} - ACRES HARVESTED",
        "domain_desc": "TOTAL",
    }
    url = f"{API}?{urllib.parse.urlencode(query)}"
    with urllib.request.urlopen(url, timeout=300) as resp:
        data = json.load(resp)["data"]
    found = {}
    for r in data:
        if r["county_code"] in ("", "998"):
            continue
        value = r["Value"].replace(",", "").strip()
        found[r["state_fips_code"] + r["county_code"]] = (
            r["state_alpha"],
            float(value) if value.replace(".", "").isdigit() else None,
        )
    return found


def main() -> None:
    key, rows = _key(), []
    for crop, series in SERIES.items():
        total = fetch(key, series)
        irrigated = fetch(key, f"{series}, IRRIGATED")
        sums: dict[str, list[float]] = {}  # region: [irrigated, harvested kept, harvested all]
        for fips, (state, acres) in total.items():
            if acres is None:
                continue
            region = crop_region(crop, fips, ers_region(fips), state)[0]
            wet = irrigated.get(fips, (state, 0.0))[1]
            for name in {region, NATIONAL} - {None}:
                s = sums.setdefault(name, [0.0, 0.0, 0.0])
                s[2] += acres
                if wet is not None:
                    s[0] += min(wet, acres)
                    s[1] += acres
        for region, (wet, kept, everything) in sorted(sums.items()):
            if kept <= 0:
                continue
            rows.append(
                {
                    "crop": crop,
                    "region": region,
                    "irrigated_acres": round(wet),
                    "harvested_acres": round(kept),
                    "share": round(wet / kept, 4),
                    "coverage": round(kept / everything, 4),
                    "year": 2022,
                    "verified": "true",
                    "source": f"USDA NASS 2022 Census of Agriculture, county {series}, IRRIGATED "
                    f"- ACRES HARVESTED over {series} - ACRES HARVESTED, summed over the region",
                }
            )
        print(crop, len(total), len(irrigated))
    with OUT.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"{len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
