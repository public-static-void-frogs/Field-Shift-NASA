"""Sentinel-1 VV/VH backscatter for the radar channels of the trained TempCNN.

Source: Microsoft Planetary Computer collection sentinel-1-rtc (IW GRD, terrain corrected to
gamma0, 10 m, linear power), the collection the training script crop_ts_s1.py reads. Each optical
observation date takes the nearest radar scene in time; nothing is interpolated.
"""

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from math import floor
from time import monotonic
from urllib.parse import urlsplit

import numpy as np

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-1-rtc"
MAX_GAP_DAYS = 24  # two repeat cycles of one satellite
RADIUS_M = 30.0  # same square as the optical read
MIN_VALID_PX = 3
SCENE_WORKERS = 6
MAX_ROUNDS = 3  # scene bounding boxes overstate coverage; retry with the next nearest scene
RASTER_OPTIONS = {
    "GDAL_HTTP_TIMEOUT": "8",
    "GDAL_HTTP_MAX_RETRY": "0",
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
}
# dB ranges the training script scales to 0..1 (train.py and inference.py)
VV_DB_RANGE = (-30.0, 5.0)
VH_DB_RANGE = (-35.0, 0.0)


class RadarUnavailable(Exception):
    pass


def normalize_db(values):
    """(n, 2) VV/VH in dB -> the 0..1 scaling used in training."""
    values = np.asarray(values, dtype="float32").copy()
    for column, (low, high) in enumerate((VV_DB_RANGE, VH_DB_RANGE)):
        values[..., column] = (values[..., column] - low) / (high - low)
    return values


def _search(points, start, end, check_budget):
    import requests

    longitudes, latitudes = zip(*points)
    body = {
        "collections": ["sentinel-1-rtc"],
        "bbox": [
            max(-180, min(longitudes) - 1e-4),
            max(-90, min(latitudes) - 1e-4),
            min(180, max(longitudes) + 1e-4),
            min(90, max(latitudes) + 1e-4),
        ],
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "limit": 250,
    }
    url, items = STAC, []
    with requests.Session() as session:
        for _ in range(4):
            check_budget()
            response = session.post(url, json=body, timeout=(5, 15))
            response.raise_for_status()
            page = response.json()
            items.extend(page.get("features", []))
            next_page = next(
                (link for link in page.get("links", []) if link["rel"] == "next"), None
            )
            if not next_page or not isinstance(next_page.get("body"), dict):
                break
            body = next_page["body"]
        check_budget()
        token = session.get(SAS, timeout=(5, 15))
        token.raise_for_status()
    return [
        item
        for item in items
        if {"vv", "vh"} <= set(item.get("assets", {}))
        and item["properties"].get("sar:instrument_mode", "IW") == "IW"
    ], token.json()["token"]


def _asset_url(asset, token):
    href = asset["href"]
    url = urlsplit(href)
    if url.scheme != "https" or not url.netloc.endswith(".blob.core.windows.net") or url.query:
        raise ValueError("Unexpected Sentinel-1 asset URL")
    return f"{href}?{token}"


def _scene_backscatter(item, points, token, check_budget):
    """{point: (vv_db, vh_db)} for the points this scene really covers."""
    import rasterio
    from pyproj import Transformer
    from rasterio.windows import Window

    half = int(RADIUS_M / 10)
    power = {}
    with rasterio.Env(**RASTER_OPTIONS):
        for band in ("vv", "vh"):
            check_budget()
            with rasterio.open(_asset_url(item["assets"][band], token)) as dataset:
                transform = Transformer.from_crs("EPSG:4326", dataset.crs, always_xy=True)
                xs, ys = transform.transform(*zip(*points))
                for point, x, y in zip(points, xs, ys):
                    check_budget()
                    row, col = dataset.index(x, y)
                    if not (
                        half <= row <= dataset.height - half and half <= col <= dataset.width - half
                    ):
                        continue
                    try:
                        values = dataset.read(
                            1, window=Window(col - half, row - half, 2 * half, 2 * half)
                        )
                    except rasterio.errors.RasterioError:
                        continue
                    values = values[np.isfinite(values) & (values > 0)]
                    if len(values) >= MIN_VALID_PX:
                        power.setdefault(point, {})[band] = float(values.mean())
    return {
        point: (10 * np.log10(bands["vv"]), 10 * np.log10(bands["vh"]))
        for point, bands in power.items()
        if len(bands) == 2
    }


def radar_sequences(dates_by_point, deadline, check_cancelled, on_progress=None):
    """{(lon, lat): [ISO dates]} -> {(lon, lat): float32 (dates, 2) VV/VH in dB, or a reason}."""
    cells = defaultdict(dict)
    for (lon, lat), dates in dates_by_point.items():
        cells[floor(lon / 2), floor(lat / 2)][lon, lat] = dates
    results = {}
    for cell in cells.values():
        results.update(_load_cell(cell, deadline, check_cancelled, on_progress))
    return results


def _load_cell(dates_by_point, deadline, check_cancelled, on_progress):
    import rasterio
    import requests

    def check_budget():
        check_cancelled()
        if monotonic() >= deadline:
            raise RadarUnavailable("Satellite download time limit reached")

    points = list(dates_by_point)
    days = sorted({day for dates in dates_by_point.values() for day in dates})
    values = {}  # (scene id, point) -> (vv, vh) or None when the scene has no data there
    chosen = {}  # (point, day) -> (vv, vh)
    reason = None
    try:
        gap = timedelta(days=MAX_GAP_DAYS)
        items, token = _search(
            points,
            (date.fromisoformat(days[0]) - gap).isoformat(),
            (date.fromisoformat(days[-1]) + gap).isoformat(),
            check_budget,
        )
        scenes = {item["id"]: item for item in items}
        scene_day = {
            scene: date.fromisoformat(item["properties"]["datetime"][:10])
            for scene, item in scenes.items()
        }

        def candidates(point, day):
            lon, lat = point
            target = date.fromisoformat(day)
            near = []
            for scene, item in scenes.items():
                west, south, east, north = item["bbox"]
                distance = abs((scene_day[scene] - target).days)
                if distance <= MAX_GAP_DAYS and west <= lon <= east and south <= lat <= north:
                    near.append((distance, scene))
            return [scene for _, scene in sorted(near)]

        order = {
            (point, day): candidates(point, day)
            for point, dates in dates_by_point.items()
            for day in dates
        }

        def read_scene(scene, wanted):
            check_budget()
            try:
                return _scene_backscatter(scenes[scene], wanted, token, check_budget)
            except (rasterio.errors.RasterioError, OSError, KeyError, ValueError):
                return {}

        with ThreadPoolExecutor(max_workers=SCENE_WORKERS) as pool:
            for _ in range(MAX_ROUNDS):
                wanted = defaultdict(list)
                for (point, day), scene_ids in order.items():
                    if (point, day) in chosen:
                        continue
                    for scene in scene_ids:
                        if (scene, point) not in values:
                            if point not in wanted[scene]:
                                wanted[scene].append(point)
                            break
                        if values[scene, point] is not None:
                            chosen[point, day] = values[scene, point]
                            break
                if not wanted:
                    break
                jobs = {scene: pool.submit(read_scene, scene, pts) for scene, pts in wanted.items()}
                for scene, job in jobs.items():
                    found = job.result()
                    for point in wanted[scene]:
                        values[scene, point] = found.get(point)
            for (point, day), scene_ids in order.items():
                if (point, day) not in chosen:
                    hit = next(
                        (values[s, point] for s in scene_ids if values.get((s, point))), None
                    )
                    if hit is not None:
                        chosen[point, day] = hit
    except RadarUnavailable as error:
        reason = str(error)
    except (requests.RequestException, ValueError, KeyError):
        reason = "Radar catalog unavailable"

    results = {}
    for point, dates in dates_by_point.items():
        found = [chosen.get((point, day)) for day in dates]
        missing = sum(value is None for value in found)
        if missing:
            results[point] = reason or (
                f"No Sentinel-1 radar observation within {MAX_GAP_DAYS} days "
                f"for {missing} of {len(dates)} dates"
            )
        else:
            results[point] = np.asarray(found, dtype="float32")
        if on_progress is not None:
            on_progress(point, len(dates))
    return results
