"""Stream the supplied CSB estimate archive into PostgreSQL, with restart checkpoints.

Run from backend/: python scripts/import_csb_bounds.py /path/to/csb_bounds.zip
No input code is executed. Raw source identities and estimate quality are retained.
"""

import argparse
import hashlib
import json
import math
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.core.config import Settings  # noqa: E402
from app.core.database import database_engine  # noqa: E402
from app.services.maps import rebuild_cells  # noqa: E402

COLUMNS = (
    "id",
    "name",
    "crop",
    "area",
    "geometry",
    "attributes",
    "created_at",
    "source_id",
    "boundary_kind",
    "state_fips",
    "county_fips",
    "county",
    "min_lon",
    "min_lat",
    "max_lon",
    "max_lat",
    "centroid_lon",
    "centroid_lat",
)
SOURCE_COLUMNS = (
    "CSBID",
    "area_acres",
    "STATEFIPS",
    "CNTYFIPS",
    "CNTY",
    "min_lon",
    "min_lat",
    "max_lon",
    "max_lat",
    "centroid_lon",
    "centroid_lat",
)
ACRE_HECTARES = 0.40468564224


def source_record(values, now):
    source_id, acres, state, county_code, county, west, south, east, north, lon, lat = values
    if len(source_id) != 15 or not source_id.isdigit():
        raise ValueError(f"Invalid CSBID {source_id!r}")
    if not all(math.isfinite(v) for v in (acres, west, south, east, north, lon, lat)):
        raise ValueError(f"Non-finite values for {source_id}")
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90 and acres > 0):
        raise ValueError(f"Invalid bounds/area for {source_id}")
    fid = str(uuid5(NAMESPACE_URL, f"usda-nass-csb:2025:{source_id}"))
    return (
        fid,
        f"CSB {source_id}",
        None,
        acres * ACRE_HECTARES,
        None,
        "{}",
        now,
        source_id,
        "estimated_bounds",
        state,
        county_code,
        county,
        west,
        south,
        east,
        north,
        lon,
        lat,
    )


def save_progress(connection, metadata):
    connection.execute(
        text(
            "INSERT INTO map_datasets (id, metadata) VALUES ('csb-2025', :metadata) "
            "ON CONFLICT (id) DO UPDATE SET metadata = EXCLUDED.metadata"
        ),
        dict(metadata=json.dumps(metadata)),
    )


def import_archive(archive_path):
    import pyarrow.parquet as pq

    settings = Settings()
    engine = database_engine(settings.database_url)
    if engine.dialect.name != "postgresql":
        raise ValueError("The full-scale importer requires PostgreSQL (COPY and GiST indexes).")
    digest = hashlib.sha256()
    with archive_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    archive_hash = digest.hexdigest()
    with engine.connect() as connection:
        metadata = connection.scalar(text("SELECT metadata FROM map_datasets WHERE id='csb-2025'"))
        if metadata and metadata["archiveSha256"] != archive_hash:
            raise ValueError(
                "A different archive is already registered; use a separate source edition."
            )
        if not metadata:
            metadata = dict(
                source="USDA NASS CSB 2025",
                boundaryKind="estimated_bounds",
                total=0,
                bounds=None,
                status="importing",
                archiveSha256=archive_hash,
                archiveName=archive_path.name,
                completedPartitions=[],
                importedAt=None,
            )
            if connection.scalar(text("SELECT count(*) FROM fields")) == 0:
                connection.execute(text("DROP INDEX IF EXISTS ix_fields_spatial"))
            save_progress(connection, metadata)
            connection.commit()
        started = time.monotonic()
        with zipfile.ZipFile(archive_path) as archive:
            partitions = sorted(n for n in archive.namelist() if n.endswith(".parquet"))
            for name in partitions:
                if name in metadata["completedPartitions"]:
                    continue
                now = datetime.now(timezone.utc)
                added = 0
                bounds = metadata["bounds"] or [180, 90, -180, -90]
                with archive.open(name) as source:
                    parquet = pq.ParquetFile(source)
                    raw = connection.connection.driver_connection
                    with raw.cursor() as cursor:
                        with cursor.copy(f"COPY fields ({', '.join(COLUMNS)}) FROM STDIN") as copy:
                            for batch in parquet.iter_batches(
                                batch_size=8192, columns=SOURCE_COLUMNS
                            ):
                                for values in zip(
                                    *(batch.column(key).to_pylist() for key in SOURCE_COLUMNS)
                                ):
                                    record = source_record(values, now)
                                    copy.write_row(record)
                                    bounds = [
                                        min(bounds[0], record[12]),
                                        min(bounds[1], record[13]),
                                        max(bounds[2], record[14]),
                                        max(bounds[3], record[15]),
                                    ]
                                    added += 1
                metadata["total"] += added
                metadata["bounds"] = bounds
                metadata["completedPartitions"].append(name)
                metadata["importedAt"] = now.isoformat()
                metadata["status"] = "importing"
                save_progress(connection, metadata)
                connection.commit()
                print(
                    json.dumps(
                        dict(
                            partition=name,
                            imported=added,
                            total=metadata["total"],
                            seconds=round(time.monotonic() - started, 1),
                        )
                    ),
                    flush=True,
                )
        if metadata["status"] != "ready":
            print("Building spatial index and map overview cells…", flush=True)
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_fields_spatial ON fields USING gist "
                    "(box(point(min_lon, min_lat), point(max_lon, max_lat)))"
                )
            )
            connection.commit()
            rebuild_cells(connection)
            metadata["status"] = "ready"
            metadata["importedAt"] = datetime.now(timezone.utc).isoformat()
            save_progress(connection, metadata)
            connection.commit()
            connection.execute(text("ANALYZE fields"))
            connection.execute(text("ANALYZE field_map_cells"))
            connection.commit()
        print(json.dumps(metadata), flush=True)
    engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    import_archive(parser.parse_args().archive)
