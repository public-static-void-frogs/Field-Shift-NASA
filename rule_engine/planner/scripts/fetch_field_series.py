"""Dated greenness of single fields, with a few pictures per season, from NASA HLS (30 m).

    python rule_engine/planner/scripts/fetch_field_series.py \
        --fields data/local/usa_sample_v2/fields.jsonl --field 171825000041665 --years 2020 2025

Reads Harmonized Landsat Sentinel-2 v2.0 (Landsat 8/9 and Sentinel-2, a view every two to three
days) from the Microsoft Planetary Computer copy with its anonymous token; that copy starts in
2020. The field outline is not in the fields file, so the indices are the mean over a square
in the middle of the field (half the side of a square of the field's area), using only pixels
the HLS quality mask calls clear of cloud, shadow and snow.

Writes, per field, under --out/<field id>/:
- series.csv: one row per clear view: date, sensor, NDVI, EVI, NDWI, pixels used;
- yearly.csv: per year the highest NDVI and its date, the April-October mean and the views;
- chips/<date>_<sensor>.png: --chips true-colour pictures per year, spread over the season,
  about 2 km across with the field in the centre, and chips.json listing them with their NDVI.
"""

import argparse
import csv
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from pathlib import Path

import numpy as np
import rasterio
import requests
from field_pool import load_fields
from PIL import Image
from pyproj import Transformer
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[3]
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}"
# collection -> band names of blue, green, red, near infrared, shortwave infrared
BANDS = {
    "hls2-s30": {"blue": "B02", "green": "B03", "red": "B04", "nir": "B8A", "swir": "B11"},
    "hls2-l30": {"blue": "B02", "green": "B03", "red": "B04", "nir": "B05", "swir": "B06"},
}
NOT_CLEAR = 0b11110  # Fmask bits: cloud, next to cloud or shadow, cloud shadow, snow or ice
SCALE, FILL = 0.0001, -9999
PIXEL_M = 30.0
M2_PER_ACRE = 4046.86
CHIP_PIXELS = 64
CHIP_ZOOM = 6
MAX_SCENE_CLOUD = 80
MIN_CLEAR_SHARE = 0.75
HEADERS = {"User-Agent": "python-requests"}
GDAL = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "GDAL_HTTP_MAX_RETRY": "3"}

_tokens: dict[str, tuple[str, float]] = {}
_lock = threading.Lock()


def token(collection: str) -> str:
    with _lock:
        value, at = _tokens.get(collection, ("", 0.0))
        if time.time() - at > 1200:
            response = requests.get(
                TOKEN.format(collection=collection), headers=HEADERS, timeout=60
            )
            response.raise_for_status()
            value = response.json()["token"]
            _tokens[collection] = (value, time.time())
        return value


def scenes(lon: float, lat: float, year: int) -> list[dict]:
    body = {
        "collections": list(BANDS),
        "intersects": {"type": "Point", "coordinates": [lon, lat]},
        "datetime": f"{year}-01-01T00:00:00Z/{year}-12-31T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": MAX_SCENE_CLOUD}},
        "limit": 250,
    }
    found = []
    while body:
        response = requests.post(STAC, json=body, headers=HEADERS, timeout=120)
        response.raise_for_status()
        page = response.json()
        found += page["features"]
        following = next((link for link in page.get("links", []) if link["rel"] == "next"), None)
        body = following["body"] if following else None
    return found


def window(href: str, collection: str, lon: float, lat: float, pixels: int) -> np.ndarray | None:
    """A square of `pixels` x `pixels` around the point; None if it leaves the tile."""
    with rasterio.Env(**GDAL), rasterio.open(f"/vsicurl/{href}?{token(collection)}") as raster:
        x, y = Transformer.from_crs(4326, raster.crs, always_xy=True).transform(lon, lat)
        row, col = raster.index(x, y)
        top, left = row - pixels // 2, col - pixels // 2
        if top < 0 or left < 0 or top + pixels > raster.height or left + pixels > raster.width:
            return None
        return raster.read(1, window=Window(left, top, pixels, pixels))


def view(item: dict, lon: float, lat: float, core: int) -> dict | None:
    """Indices of one scene over the middle of the field, or None if it is not clear there."""
    collection, assets = item["collection"], item["assets"]
    try:
        mask = window(assets["Fmask"]["href"], collection, lon, lat, core)
        if mask is None:
            return None
        clear = (mask & NOT_CLEAR) == 0
        if clear.mean() < MIN_CLEAR_SHARE:
            return None
        band = {}
        for name in ("blue", "red", "nir", "swir"):
            raw = window(assets[BANDS[collection][name]]["href"], collection, lon, lat, core)
            clear &= raw != FILL
            band[name] = raw.astype(np.float64) * SCALE
    except (rasterio.errors.RasterioError, requests.RequestException):
        return None
    if clear.mean() < MIN_CLEAR_SHARE:
        return None
    blue, red, nir, swir = (float(band[name][clear].mean()) for name in band)
    if min(blue, red, nir, swir) <= 0:  # snow and haze can leave negative reflectance
        return None
    return {
        "date": datetime.fromisoformat(item["properties"]["datetime"].replace("Z", "+00:00"))
        .date()
        .isoformat(),
        "sensor": "Sentinel-2" if collection == "hls2-s30" else "Landsat",
        "ndvi": round((nir - red) / (nir + red), 4),
        "evi": round(2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1), 4),
        "ndwi": round((nir - swir) / (nir + swir), 4),
        "pixels": int(clear.sum()),
        "item": item,
    }


def spread(views: list[dict], count: int) -> list[dict]:
    """`count` views of a year at even distances through the growing season."""
    season = [v for v in views if 4 <= int(v["date"][5:7]) <= 10] or views
    if len(season) <= count:
        return season
    picks = np.linspace(0, len(season) - 1, count).round().astype(int)
    return [season[i] for i in sorted(set(picks.tolist()))]


def chip(found: dict, lon: float, lat: float, path: Path) -> bool:
    """True-colour picture around the field; the cross marks the field's centroid."""
    item = found["item"]
    collection = item["collection"]
    layers = []
    for name in ("red", "green", "blue"):
        href = item["assets"][BANDS[collection][name]]["href"]
        try:
            raw = window(href, collection, lon, lat, CHIP_PIXELS)
        except (rasterio.errors.RasterioError, requests.RequestException):
            return False
        if raw is None:
            return False
        layers.append(np.clip(raw.astype(np.float64) * SCALE / 0.25, 0, 1) ** (1 / 1.8))
    picture = (np.dstack(layers) * 255).astype(np.uint8)
    picture = np.kron(picture, np.ones((CHIP_ZOOM, CHIP_ZOOM, 1), dtype=np.uint8))
    middle, arm = CHIP_PIXELS * CHIP_ZOOM // 2, 2 * CHIP_ZOOM
    picture[middle, middle - arm : middle + arm] = (255, 255, 255)
    picture[middle - arm : middle + arm, middle] = (255, 255, 255)
    Image.fromarray(picture).save(path)
    return True


def yearly(views: list[dict]) -> list[dict]:
    rows = []
    for year in sorted({v["date"][:4] for v in views}):
        of_year = [v for v in views if v["date"][:4] == year]
        season = [v for v in of_year if 4 <= int(v["date"][5:7]) <= 10]
        best = max(of_year, key=lambda v: v["ndvi"])
        rows.append(
            {
                "year": year,
                "ndvi_peak": best["ndvi"],
                "peak_date": best["date"],
                "ndvi_mean_apr_oct": round(float(np.mean([v["ndvi"] for v in season])), 4)
                if season
                else "",
                "clear_views": len(of_year),
            }
        )
    return rows


def write(path: Path, rows: list[dict], columns: list[str]) -> None:
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fields", type=Path, required=True)
    parser.add_argument("--field", nargs="+", required=True, help="field ids")
    parser.add_argument("--years", type=int, nargs=2, default=(2020, date.today().year - 1))
    parser.add_argument("--chips", type=int, default=4, help="pictures per year")
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--out", type=Path, default=ROOT / "data/local/planner/greenness/fields")
    args = parser.parse_args()
    wanted = set(args.field)
    fields = [f for f in load_fields(args.fields) if f["id"] in wanted]
    for missing in wanted - {f["id"] for f in fields}:
        print(f"{missing}: not in {args.fields}")

    for field in fields:
        started = time.time()
        lon, lat = field["longitude"], field["latitude"]
        side = (field["area"] * M2_PER_ACRE) ** 0.5 / PIXEL_M
        core = int(min(15, max(3, side // 2)))
        found = []
        for year in range(args.years[0], args.years[1] + 1):
            found += scenes(lon, lat, year)
        with ThreadPoolExecutor(args.workers) as pool:
            views = [v for v in pool.map(lambda item: view(item, lon, lat, core), found) if v]
        # a field in the overlap of two tiles is seen twice: keep the view with more pixels
        best: dict[tuple, dict] = {}
        for found_view in views:
            key = (found_view["date"], found_view["sensor"])
            if key not in best or found_view["pixels"] > best[key]["pixels"]:
                best[key] = found_view
        views = [best[key] for key in sorted(best)]
        folder = args.out / field["id"]
        (folder / "chips").mkdir(parents=True, exist_ok=True)
        write(folder / "series.csv", views, ["date", "sensor", "ndvi", "evi", "ndwi", "pixels"])
        summary = yearly(views)
        write(folder / "yearly.csv", summary, list(summary[0]) if summary else ["year"])

        chosen = []
        for year in sorted({v["date"][:4] for v in views}):
            chosen += spread([v for v in views if v["date"][:4] == year], args.chips)

        def draw(found: dict) -> dict | None:
            name = f"{found['date']}_{found['sensor'].lower()}.png"
            if not chip(found, lon, lat, folder / "chips" / name):  # noqa: B023
                return None
            return {"file": f"chips/{name}", "date": found["date"], "sensor": found["sensor"],
                    "ndvi": found["ndvi"], "widthM": CHIP_PIXELS * PIXEL_M}  # fmt: skip

        with ThreadPoolExecutor(args.workers) as pool:
            chips = [c for c in pool.map(draw, chosen) if c]
        (folder / "chips.json").write_text(json.dumps(chips, indent=2) + "\n")
        print(f"{field['id']}: {len(found)} scenes, {len(views)} clear views, {len(chips)} "
              f"pictures, middle square {core} x {core} pixels, {time.time() - started:.0f} s",
              flush=True)  # fmt: skip


if __name__ == "__main__":
    main()
