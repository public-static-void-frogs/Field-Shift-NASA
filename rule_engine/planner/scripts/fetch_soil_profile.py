"""Slope length and topsoil bulk density of every map unit, from USDA NRCS Soil Data Access.

    python rule_engine/planner/scripts/fetch_soil_profile.py \
        --fields data/local/usa_sample_v2/fields.jsonl \
        --out data/local/planner/soil/mukey_profile.csv

Per map unit (the `soil.mukey` of the fields), over its major components weighted by their share
of the map unit:
    slope_length_m      USLE slope length (component.slopelenusle_r)
    bulk_density_g_cm3  bulk density at 1/3 bar of the top 30 cm (chorizon.dbthirdbar_r),
                        each horizon weighted by its thickness inside 0-30 cm

These are SSURGO map-unit estimates, not measurements on the field. Resumable: map units already
in --out are skipped. The service is anonymous.
"""

import argparse
import csv
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SDA_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest"
FIELDS = ["mukey", "slope_length_m", "bulk_density_g_cm3"]
TOP_CM = 30


def sda(query: str, timeout: float = 120.0) -> list[dict]:
    """Rows of an SDA query; integer columns are cast to FLOAT in the queries, as their products
    overflow SQL Server smallint."""
    body = json.dumps({"format": "JSON+COLUMNNAME", "query": query}).encode()
    request = urllib.request.Request(
        SDA_URL,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "python-urllib"},
    )
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
                table = json.load(response).get("Table") or []
            return [dict(zip(table[0], row, strict=True)) for row in table[1:]]
        except OSError:
            if attempt == 4:
                raise
            time.sleep(5 * (attempt + 1))
    return []


def fetch(keys: list[str]) -> list[dict]:
    inside = ",".join(f"'{int(k)}'" for k in keys)
    out = {k: {"mukey": k, "slope_length_m": None, "bulk_density_g_cm3": None} for k in keys}
    for row in sda(f"""
        SELECT mukey,
            SUM(CAST(slopelenusle_r AS FLOAT) * comppct_r)
                / NULLIF(SUM(CASE WHEN slopelenusle_r IS NOT NULL THEN CAST(comppct_r AS FLOAT) END), 0) AS length
        FROM component WHERE mukey IN ({inside}) AND majcompflag = 'Yes' GROUP BY mukey"""):
        if row["length"] is not None:
            out[row["mukey"]]["slope_length_m"] = round(float(row["length"]), 1)
    inside_top = (
        f"((CASE WHEN h.hzdepb_r < {TOP_CM} THEN h.hzdepb_r ELSE {TOP_CM} END)"
        f" - (CASE WHEN h.hzdept_r > 0 THEN h.hzdept_r ELSE 0 END))"
    )
    for row in sda(f"""
        SELECT c.mukey,
            SUM(h.dbthirdbar_r * CAST(c.comppct_r AS FLOAT) * {inside_top})
                / NULLIF(SUM(CASE WHEN h.dbthirdbar_r IS NOT NULL
                                  THEN CAST(c.comppct_r AS FLOAT) * {inside_top} END), 0) AS density
        FROM component c JOIN chorizon h ON h.cokey = c.cokey
        WHERE c.mukey IN ({inside}) AND c.majcompflag = 'Yes'
            AND h.hzdept_r < {TOP_CM} AND h.hzdepb_r > h.hzdept_r
        GROUP BY c.mukey"""):
        if row["density"] is not None:
            out[row["mukey"]]["bulk_density_g_cm3"] = round(float(row["density"]), 3)
    return list(out.values())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fields", required=True, type=Path, help="planner fields.jsonl")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--batch", type=int, default=250)
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    wanted: set[str] = set()
    with args.fields.open() as handle:
        for line in handle:
            mukey = str((json.loads(line).get("soil") or {}).get("mukey") or "")
            if mukey.isdigit():
                wanted.add(mukey)
    done = set()
    if args.out.exists():
        with args.out.open(newline="") as handle:
            done = {r["mukey"] for r in csv.DictReader(handle)}
    todo = sorted(wanted - done)
    batches = [todo[i : i + args.batch] for i in range(0, len(todo), args.batch)]
    print(f"{len(wanted):,} map units, {len(todo):,} to fetch in {len(batches)} batches")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("a", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        if not done:
            writer.writeheader()
        with ThreadPoolExecutor(args.workers) as pool:
            for i, rows in enumerate(pool.map(fetch, batches), start=1):
                writer.writerows(rows)
                handle.flush()
                if i % 10 == 0 or i == len(batches):
                    print(f"  batches {i}/{len(batches)}", flush=True)


if __name__ == "__main__":
    main()
