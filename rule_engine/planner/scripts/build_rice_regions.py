"""County -> USDA ERS rice cost region, for the rice-growing counties of the Census of Agriculture.

    python rule_engine/planner/scripts/build_rice_regions.py

Needs USDA_DATA_KEY in .env or the environment. Writes rule_engine/planner/data/rice_regions.csv
(county_fips, region, verified, basis) for every county with rice acres harvested in the 2022
Census in Arkansas, Louisiana, Missouri, Mississippi and Texas. tables.crop_region reads it;
California is one region and needs no county list.

ERS publishes no county list for its rice regions. Its descriptions are:

- EIB-202 (2018), p. 2: "Arkansas Grand Prairie (Non-Delta); Mississippi Delta, (parts of Arkansas,
  Mississippi, Missouri, and Louisiana); Gulf Coast (Texas and Southwest Louisiana); and Sacramento
  Valley (California)" (https://www.ers.usda.gov/media/8889/eib-202.pdf);
- Amber Waves, May 2020: the Arkansas Non-Delta is primarily the Grand Prairie plus some additional
  counties in northeast Arkansas and southeast Missouri.

So Texas is Gulf Coast and Mississippi Delta (verified), and so are NASS's Southwest Louisiana
district (Gulf Coast), its Northeast Louisiana district (Delta) and the four Grand Prairie
counties (Non-Delta). The others are flagged unverified:

- Arkansas and Missouri counties on the Mississippi River are Delta, after ERS's pre-1995 Delta,
  the "River Counties of Arkansas, Louisiana, and Mississippi" (its documentation page). Lee and
  Phillips grow their rice in the Western Lowlands and would otherwise be Non-Delta;
- the rest are placed by where their rice grows. data/rice_ecoregions.csv
  (scripts/build_rice_ecoregions.py) holds each county's share of CDL rice acres in the EPA
  ecoregions that stand for the regions (Western Gulf Coastal Plain: Gulf Coast; Grand Prairie
  and Western Lowlands: Non-Delta; the rest of the Mississippi Alluvial Plain: Delta), rice
  outside them counting for Non-Delta in Arkansas and Missouri and for Delta in Louisiana, and
  the county takes the largest;
- a county with no CDL rice keeps this work's earlier reading: Delta in NASS's Southeast
  Arkansas district, otherwise Non-Delta in Arkansas and Missouri; Gulf Coast for Evangeline,
  St. Landry and the South Central district, otherwise Delta in Louisiana.
"""

import csv
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "rule_engine" / "scripts"))
from fetch_nass_reference import API, _key  # noqa: E402

OUT = ROOT / "rule_engine" / "planner" / "data" / "rice_regions.csv"
ECOREGIONS = OUT.with_name("rice_ecoregions.csv")
NON_DELTA, DELTA, GULF = "Arkansas Non-Delta", "Mississippi River Delta", "Gulf Coast"
GRAND_PRAIRIE = {"05001", "05085", "05095", "05117"}  # Arkansas, Lonoke, Monroe, Prairie
RIVER = {  # counties bordering the Mississippi River
    "05017", "05035", "05041", "05077", "05093", "05107",  # AR: Chicot, Crittenden, Desha, Lee, Mississippi, Phillips
    "29133", "29143", "29155", "29201",  # MO: Mississippi, New Madrid, Pemiscot, Scott
}  # fmt: skip
LA_PRAIRIE = {"22039", "22097"}  # Evangeline, St. Landry


ZONES = {"delta": DELTA, "gulf_coast": GULF, "non_delta": NON_DELTA}


def ecoregions() -> dict[str, dict[str, float]]:
    with ECOREGIONS.open(newline="") as handle:
        return {
            r["county_fips"]: {k: float(v) for k, v in r.items() if k != "county_fips"}
            for r in csv.DictReader(handle)
        }


def region(
    state: str, fips: str, district: str, shares: dict[str, float] | None = None
) -> tuple[str, bool, str]:
    if state == "TX":
        return GULF, True, "EIB-202: Gulf Coast is Texas and Southwest Louisiana"
    if state == "MS":
        return DELTA, True, "EIB-202: Mississippi rice is in the Mississippi Delta region"
    if state == "LA" and district == "SOUTHWEST":
        return GULF, True, "EIB-202: Southwest Louisiana is Gulf Coast (NASS district)"
    if state == "LA" and district == "NORTHEAST":
        return DELTA, True, "EIB-202: the Delta holds part of Louisiana (NASS Northeast district)"
    if fips in GRAND_PRAIRIE:
        return NON_DELTA, True, "EIB-202 and Amber Waves 2020: the Grand Prairie is Non-Delta"
    if fips in RIVER:
        return (
            DELTA,
            False,
            "ERS before 1995: the Delta is the River Counties; this county borders the river",
        )
    if shares and shares.get("rice_acre_years"):
        votes = {name: shares.get(key, 0.0) for key, name in ZONES.items()}
        votes[DELTA if state == "LA" else NON_DELTA] += shares.get("outside", 0.0)
        best = max(votes, key=lambda name: votes[name])
        return (
            best,
            False,
            f"EPA ecoregion proxy: {votes[best]:.0%} of the county's CDL 2021-2023 rice acres",
        )
    if state == "LA":
        if district == "SOUTH CENTRAL" or fips in LA_PRAIRIE:
            return GULF, False, "this work: a prairie parish next to Southwest Louisiana"
        return DELTA, False, "this work: a Louisiana parish outside Southwest Louisiana"
    if district == "SOUTHEAST" and state == "AR":
        return DELTA, False, "this work: in NASS's Southeast Arkansas district"
    return NON_DELTA, False, "this work: Amber Waves 2020 adds northeast AR and southeast MO"


def fetch(key: str, state: str) -> list[dict]:
    query = {
        "key": key,
        "format": "JSON",
        "source_desc": "CENSUS",
        "year": "2022",
        "agg_level_desc": "COUNTY",
        "short_desc": "RICE - ACRES HARVESTED",
        "domain_desc": "TOTAL",
        "state_alpha": state,
    }
    with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(query)}", timeout=120) as resp:
        return json.load(resp)["data"]


def main() -> None:
    key, rows, eco = _key(), [], ecoregions()
    for state in ("AR", "LA", "MO", "MS", "TX"):
        for r in fetch(key, state):
            if r["county_code"] in ("", "998"):  # 998: counties NASS combines
                continue
            fips = r["state_fips_code"] + r["county_code"]
            name, verified, basis = region(state, fips, r["asd_desc"], eco.get(fips))
            rows.append((fips, name, str(verified).lower(), basis))
    with OUT.open("w", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["county_fips", "region", "verified", "basis"])
        writer.writerows(sorted(set(rows)))
    print(f"{len(rows)} counties -> {OUT}")


if __name__ == "__main__":
    main()
