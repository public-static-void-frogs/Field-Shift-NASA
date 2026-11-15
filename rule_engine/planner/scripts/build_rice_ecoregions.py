"""Share of each county's rice in the EPA ecoregions that stand for the ERS rice cost regions.

    curl -o <new empty dir>/map.zip https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/map/map_eco_l4.zip
    curl -o <another new empty dir>/la.zip https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/la/la_eco_l4.zip
    python -I rule_engine/planner/scripts/build_rice_ecoregions.py <map_eco_l4.shp> <la_eco_l4.shp> \
        <CSB fields csv> <CDL history parquet>

Writes rule_engine/planner/data/rice_ecoregions.csv (county_fips, delta, gulf_coast, non_delta,
outside, rice_acre_years), which scripts/build_rice_regions.py reads.

Every Crop Sequence Boundaries field in Arkansas, Louisiana, Mississippi and Missouri that the
Cropland Data Layer calls rice (code 3) in any of 2021-2023 is weighted by acres x rice years and
placed by its centroid in the EPA Level IV ecoregions (the Mississippi Alluvial Plain state map
and the Louisiana map, EPSG 5070):

- Level III 34, Western Gulf Coastal Plain: Gulf Coast;
- Level IV 73e Grand Prairie, 73f and 73g Western Lowlands: Arkansas Non-Delta, which ERS
  describes as the Grand Prairie plus some counties of north-east Arkansas and south-east Missouri;
- the rest of Level III 73, Mississippi Alluvial Plain: Mississippi River Delta;
- anything else (Crowley's Ridge, the uplands): outside.

The CDL crop is a satellite estimate, not what the farmer declared, and an ecoregion is a
landscape, not a cost region: the shares are a proxy, and the regions built from them are
flagged unverified.
"""

import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "rule_engine" / "planner" / "data" / "rice_ecoregions.csv"
STATES = ("05", "22", "28", "29")  # AR, LA, MS, MO
YEARS = ("CDL2021", "CDL2022", "CDL2023")
RICE = 3
ZONES = {
    "Delta": "delta",
    "Gulf Coast": "gulf_coast",
    "Non-Delta": "non_delta",
    "outside": "outside",
}


def zone(l3: str, l4: str) -> str:
    if l3 == "34":
        return "Gulf Coast"
    if l4 in ("73e", "73f", "73g"):
        return "Non-Delta"
    if l3 == "73":
        return "Delta"
    return "outside"


def main(map_shp: str, la_shp: str, fields_csv: str, cdl_parquet: str) -> None:
    eco = pd.concat([gpd.read_file(map_shp), gpd.read_file(la_shp)])
    eco = gpd.GeoDataFrame(eco[["US_L3CODE", "US_L4CODE", "geometry"]], crs=5070)
    cdl = pd.read_parquet(cdl_parquet, columns=["CSBID", *YEARS])
    cdl["rice_years"] = (cdl[list(YEARS)] == RICE).sum(axis=1)
    cdl = cdl[cdl.rice_years > 0]
    fields = pd.read_csv(
        fields_csv,
        dtype={"source_id": str, "state_fips": str, "county_fips": str},
        usecols=["source_id", "state_fips", "county_fips", "acres", "longitude", "latitude"],
    )
    fields = fields[fields.state_fips.isin(STATES)].merge(
        cdl, left_on="source_id", right_on="CSBID"
    )
    fields["weight"] = fields.acres * fields.rice_years
    points = gpd.GeoDataFrame(
        fields,
        geometry=gpd.points_from_xy(fields.longitude, fields.latitude),
        crs=4326,
    ).to_crs(5070)
    joined = gpd.sjoin(points, eco, how="left", predicate="within")
    joined = joined[~joined.index.duplicated()]
    joined["zone"] = [
        zone(str(l3), str(l4)) for l3, l4 in zip(joined.US_L3CODE, joined.US_L4CODE, strict=True)
    ]
    joined["county_fips"] = joined.state_fips + joined.county_fips
    table = joined.pivot_table(
        index="county_fips", columns="zone", values="weight", aggfunc="sum", fill_value=0
    ).reindex(columns=list(ZONES), fill_value=0)
    total = table.sum(axis=1)
    shares = table.div(total, axis=0).round(3).rename(columns=ZONES)
    shares["rice_acre_years"] = total.round().astype(int)
    shares.sort_index().to_csv(OUT, lineterminator="\n")
    print(f"{len(fields)} rice fields, {len(shares)} counties -> {OUT}")


if __name__ == "__main__":
    main(*sys.argv[1:5])
