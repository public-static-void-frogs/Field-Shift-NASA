"""Irrigated or dryland, per field and year, from two public 30 m maps (no account needed).

    python rule_engine/planner/scripts/fetch_irrigation.py \
        --fields data/local/usa_sample_v2/fields.jsonl

- LANID-US (Xie et al., Zenodo record 5548555, CC-BY-4.0): the whole US, 1997-2017.
- IrrMapper v1.2 (Zenodo record 23603289, CC-BY-4.0): eleven western states, 1985-2025.

Both are Landsat classifications, not farmer records: 1 = irrigated, 0 = not. Each field gets
the value of the pixel at its centroid and the irrigated share of the 3 x 3 pixels around it.
Downloads go to --raw (about 10 GB) and are kept; writes --out with one row per field, year
and source. --fields is the planner's fields.jsonl or a sampler's fields.csv; the rasters are
sampled in --workers processes, one map year each.
"""

import argparse
import os
import re
import urllib.request
import zipfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from field_pool import load_fields
from pyproj import Transformer
from rasterio.windows import Window

ROOT = Path(__file__).resolve().parents[3]
ZENODO = "https://zenodo.org/api/records/{record}/files/{name}/content"
LANID = ("5548555", ["lanid1997-2003.zip", "lanid2004-2010.zip", "lanid2011-2017.zip"])
IRRMAPPER = "23603289"
IRRMAPPER_STATES = {
    "04": "AZ", "06": "CA", "08": "CO", "16": "ID", "30": "MT", "32": "NV",
    "35": "NM", "41": "OR", "49": "UT", "53": "WA", "56": "WY",
}  # fmt: skip
NODATA = 255


def download(record: str, name: str, folder: Path) -> Path:
    """The archive, unpacked into a folder of its own; returns that folder."""
    target = folder / Path(name).stem
    if target.exists():
        return target
    folder.mkdir(parents=True, exist_ok=True)
    archive = folder / name
    if not archive.exists():
        request = urllib.request.Request(
            ZENODO.format(record=record, name=name), headers={"User-Agent": "python-urllib"}
        )
        part = archive.with_suffix(".part")
        with urllib.request.urlopen(request, timeout=120) as response, part.open("wb") as out:
            while chunk := response.read(1 << 22):
                out.write(chunk)
        part.rename(archive)
    with zipfile.ZipFile(archive) as bundle:
        bundle.extractall(target)
    return target


def sample(path: Path, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Centroid pixel (1, 0 or nan) and irrigated share of the 3 x 3 pixels, per point."""
    centre = np.full(len(x), np.nan)
    share = np.full(len(x), np.nan)
    with rasterio.Env(GDAL_CACHEMAX=256), rasterio.open(path) as raster:
        rows, cols = rasterio.transform.rowcol(raster.transform, x, y)
        rows, cols = np.asarray(rows), np.asarray(cols)
        inside = (rows >= 1) & (rows < raster.height - 1) & (cols >= 1) & (cols < raster.width - 1)
        block = raster.block_shapes[0][0]
        # neighbouring points share a compressed block, so read them one after another
        for i in sorted(np.flatnonzero(inside), key=lambda i: (rows[i] // block, cols[i] // block)):
            pixels = raster.read(1, window=Window(cols[i] - 1, rows[i] - 1, 3, 3))
            valid = pixels[pixels != NODATA]
            if pixels[1, 1] != NODATA:
                centre[i] = float(pixels[1, 1] == 1)
            if valid.size:
                share[i] = float((valid == 1).mean())
    return centre, share


def run(job: tuple) -> pd.DataFrame:
    source, year, path, ids, x, y = job
    centre, share = sample(path, x, y)
    frame = pd.DataFrame({"field_id": ids, "year": year, "irrigated": centre, "share_3x3": share})
    frame["source"] = source
    return frame[frame["share_3x3"].notna()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fields", type=Path, required=True)
    parser.add_argument("--raw", type=Path, default=ROOT / "data/local/planner/irrigation/raw")
    parser.add_argument(
        "--out", type=Path, default=ROOT / "data/local/planner/irrigation/irrigation.parquet"
    )
    parser.add_argument("--workers", type=int, default=min(4, os.cpu_count() or 1))
    args = parser.parse_args()
    fields = load_fields(args.fields)
    ids = np.array([f["id"] for f in fields])
    states = np.array([f["stateFips"] for f in fields])
    to_albers = Transformer.from_crs(4326, 5070, always_xy=True)
    x, y = to_albers.transform([f["longitude"] for f in fields], [f["latitude"] for f in fields])
    x, y = np.asarray(x), np.asarray(y)

    jobs = []

    def add(source: str, year: int, keep: np.ndarray, path: Path) -> None:
        jobs.append((source, year, path, ids[keep], x[keep], y[keep]))

    everywhere = np.ones(len(fields), dtype=bool)
    for name in LANID[1]:
        for path in sorted(download(LANID[0], name, args.raw / "lanid_us").rglob("*.tif")):
            found = re.search(r"lanid(\d{4})", path.name)
            if found:
                add("LANID-US", int(found.group(1)), everywhere, path)
    for fips, state in IRRMAPPER_STATES.items():
        keep = states == fips
        if not keep.any():
            continue
        folder = download(IRRMAPPER, f"IrrMapper_v1_2_{state}.zip", args.raw / "irrmapper")
        for path in sorted(folder.rglob("*.tif")):
            found = re.search(r"_(\d{4})\.tif$", path.name)
            if found:
                add("IrrMapper-v1.2", int(found.group(1)), keep, path)

    frames = []
    with ProcessPoolExecutor(args.workers) as pool:
        for frame in pool.map(run, jobs):
            source, year = frame["source"].iat[0], int(frame["year"].iat[0])
            print(f"{source} {year}: {len(frame)} fields, "
                  f"{frame['irrigated'].mean():.1%} irrigated", flush=True)  # fmt: skip
            frames.append(frame)
    table = pd.concat(frames, ignore_index=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    table.to_parquet(args.out, index=False)
    print(f"wrote {len(table)} rows to {args.out}")


if __name__ == "__main__":
    main()
