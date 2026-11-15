"""Field pools for the fetch scripts: the planner's fields.jsonl or a sampler's fields.csv.

Both become dicts with id, longitude, latitude, stateFips and area (acres). The CSV form is
the one the larger samples write (CSBID, STATEFIPS, CSBACRES, centroid_lon, centroid_lat).
"""

import csv
import json
from pathlib import Path


def load_fields(path: Path) -> list[dict]:
    with path.open(newline="") as handle:
        if path.suffix == ".jsonl":
            return [json.loads(line) for line in handle]
        return [
            {
                "id": row["CSBID"],
                "longitude": float(row["centroid_lon"]),
                "latitude": float(row["centroid_lat"]),
                "stateFips": row["STATEFIPS"].zfill(2),
                "area": float(row["CSBACRES"]),
            }
            for row in csv.DictReader(handle)
        ]
