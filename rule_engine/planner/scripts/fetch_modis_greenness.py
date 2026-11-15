"""Greenness of every field, every 16 days since 2000, from MODIS (250 m, no account needed).

    python rule_engine/planner/scripts/fetch_modis_greenness.py \
        --fields data/local/usa_sample_v2/fields.jsonl --years 2000 2025

Reads the NDVI layer of NASA MOD13Q1 v6.1 (Terra, 16-day best-pixel composites) from the
Microsoft Planetary Computer copy with its anonymous token, and keeps the pixel under each
field's centroid. A pixel is 250 m across (about 15 acres), so for a field smaller than about
40 acres the value mixes in the neighbours: use it to compare a field with itself over the
years, not as a measurement of a small field.

--fields is the planner's fields.jsonl or a sampler's fields.csv. Writes --out/<year>.parquet (field_id, date, ndvi; composites starting day --first-day to
--last-day of the year) and --out/yearly.parquet: per field and year the highest NDVI, the day
it was reached, the mean over the composites and how many were usable; a field-year with fewer
than ten usable composites is left out. Only the parts of each 48 MB tile that hold a field are
read (about 5 GB per year for the national sample); finished years are skipped on a rerun. The copy has holes:
in November 2026 it held 2000 and 2002-2023 in full, two composites of 2001 and almost nothing
of 2024-2025. A year with fewer than ten complete composites is reported and not written.
"""

import argparse
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
import requests
from field_pool import load_fields
from pyproj import Transformer
from rasterio.transform import rowcol
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[3]
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/modiseuwest/modis-061-cogs"
ASSET = "250m_16_days_NDVI"
SINUSOIDAL = "+proj=sinu +R=6371007.181 +units=m +no_defs"
TILE_M = 1111950.5196666666
SCALE, FILL = 0.0001, -3000
MIN_COMPOSITES = 10
HEADERS = {"User-Agent": "python-requests"}
GDAL = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "GDAL_HTTP_MAX_RETRY": "5",
    "GDAL_HTTP_RETRY_DELAY": "5",
    "GDAL_HTTP_USERAGENT": "python-requests",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
}

_token = {"value": None, "at": 0.0}
_lock = threading.Lock()


def token() -> str:
    with _lock:
        if time.time() - _token["at"] > 1200:
            response = requests.get(TOKEN, headers=HEADERS, timeout=60)
            response.raise_for_status()
            _token.update(value=response.json()["token"], at=time.time())
        return _token["value"]


def items(year: int, box: list[float]) -> list[dict]:
    """Terra composites of the year over the box: (tile, start day, link)."""
    body = {
        "collections": ["modis-13Q1-061"],
        "bbox": box,
        "datetime": f"{year}-01-01T00:00:00Z/{year}-12-31T23:59:59Z",
        "query": {"platform": {"eq": "terra"}},
        "limit": 500,
    }
    found = {}
    while body:
        response = requests.post(STAC, json=body, headers=HEADERS, timeout=120)
        response.raise_for_status()
        page = response.json()
        for item in page["features"]:
            p = item["properties"]
            tile = (p["modis:horizontal-tile"], p["modis:vertical-tile"])
            day = datetime.fromisoformat(p["start_datetime"].replace("Z", "+00:00")).date()
            found[(tile, day)] = item["assets"][ASSET]["href"]
        following = next((link for link in page.get("links", []) if link["rel"] == "next"), None)
        body = following["body"] if following else None
    return [{"tile": tile, "day": day, "href": href} for (tile, day), href in sorted(found.items())]


def read(item: dict, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """NDVI under each point of the tile; nan where the composite has no value.

    Only the internal blocks of the file that hold a point are fetched (ranged reads), about half
    of each tile for the national sample."""
    for attempt in range(5):
        try:
            with (
                rasterio.Env(**GDAL),
                rasterio.open(f"/vsicurl/{item['href']}?{token()}") as raster,
            ):
                rows, cols = rowcol(raster.transform, x, y)
                rows = np.clip(np.asarray(rows), 0, raster.height - 1)
                cols = np.clip(np.asarray(cols), 0, raster.width - 1)
                size = raster.block_shapes[0][0]
                blocks = (rows // size) * 1000 + cols // size
                values = np.empty(len(x), dtype=np.float32)
                for key in np.unique(blocks):
                    top, left = int(key // 1000) * size, int(key % 1000) * size
                    window = Window(left, top, min(size, raster.width - left),
                                    min(size, raster.height - top))  # fmt: skip
                    data = raster.read(1, window=window)
                    inside = blocks == key
                    values[inside] = data[rows[inside] - top, cols[inside] - left]
            values[values <= FILL] = np.nan
            return values * SCALE
        except (rasterio.errors.RasterioError, requests.RequestException, OSError):
            if attempt == 4:
                raise
            time.sleep(5 * (attempt + 1))
    raise AssertionError


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fields", type=Path, required=True)
    parser.add_argument("--years", type=int, nargs=2, default=(2000, date.today().year - 1))
    parser.add_argument("--first-day", type=int, default=81, help="day of year, default late March")
    parser.add_argument("--last-day", type=int, default=305, help="day of year, default 1 November")
    parser.add_argument("--workers", type=int, default=24)
    parser.add_argument("--out", type=Path, default=ROOT / "data/local/planner/greenness/modis")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    fields = load_fields(args.fields)
    ids = np.array([f["id"] for f in fields])
    lon = np.array([f["longitude"] for f in fields])
    lat = np.array([f["latitude"] for f in fields])
    x, y = Transformer.from_crs(4326, SINUSOIDAL, always_xy=True).transform(lon, lat)
    across = np.floor((x + 18 * TILE_M) / TILE_M).astype(int)
    down = np.floor((9 * TILE_M - y) / TILE_M).astype(int)
    members = {tile: np.flatnonzero((across == tile[0]) & (down == tile[1]))
               for tile in set(zip(across.tolist(), down.tolist(), strict=True))}  # fmt: skip
    box = [float(lon.min()), float(lat.min()), float(lon.max()), float(lat.max())]
    print(f"{len(fields)} fields in {len(members)} tiles", flush=True)

    for year in range(args.years[1], args.years[0] - 1, -1):  # newest first
        path = args.out / f"{year}.parquet"
        if path.exists():
            continue
        started = time.time()
        wanted = [
            item
            for item in items(year, box)
            if item["tile"] in members
            and args.first_day <= item["day"].timetuple().tm_yday <= args.last_day
        ]
        tiles_per_day: dict[date, int] = {}
        for item in wanted:
            tiles_per_day[item["day"]] = tiles_per_day.get(item["day"], 0) + 1
        complete = sum(count == len(members) for count in tiles_per_day.values())
        if complete < MIN_COMPOSITES:
            print(f"{year}: only {complete} complete composites in the copy, skipped", flush=True)
            continue

        def one(item: dict) -> pd.DataFrame:
            keep = members[item["tile"]]
            return pd.DataFrame(
                {"field_id": ids[keep], "date": item["day"], "ndvi": read(item, x[keep], y[keep])}
            )

        with ThreadPoolExecutor(args.workers) as pool:
            table = pd.concat(pool.map(one, wanted), ignore_index=True)
        table = table.dropna(subset=["ndvi"]).sort_values(["field_id", "date"])
        table.to_parquet(path.with_suffix(".part"), index=False)
        path.with_suffix(".part").rename(path)
        print(f"{year}: {len(wanted)} tiles read, {len(table)} values, "
              f"{time.time() - started:.0f} s", flush=True)  # fmt: skip

    frames = []
    for path in sorted(args.out.glob("[12][0-9][0-9][0-9].parquet")):
        table = pd.read_parquet(path)
        table["doy"] = pd.to_datetime(table["date"]).dt.day_of_year
        best = table.loc[table.groupby("field_id")["ndvi"].idxmax()]
        summary = table.groupby("field_id")["ndvi"].agg(ndvi_mean="mean", composites="count")
        summary = summary.join(
            best.set_index("field_id")[["ndvi", "doy"]].rename(
                columns={"ndvi": "ndvi_peak", "doy": "peak_doy"}
            )
        )
        summary = summary[summary["composites"] >= MIN_COMPOSITES]
        summary.insert(0, "year", int(path.stem))
        frames.append(summary.reset_index())
    pd.concat(frames, ignore_index=True).to_parquet(args.out / "yearly.parquet", index=False)
    print(f"wrote {args.out / 'yearly.parquet'}")


if __name__ == "__main__":
    main()
