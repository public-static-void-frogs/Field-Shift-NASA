"""Viewport queries with spatial indexes, bounded responses and preaggregated overviews."""

import math

from sqlalchemy import delete, func, select, text

from app.repositories.maps import MapCell, MapDataset

LEVELS = (4, 6, 8, 10, 12)
MAX_FEATURES = 600


def rectangle(bounds):
    west, south, east, north = bounds
    return dict(
        type="Polygon",
        coordinates=[[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    )


def geometry_bounds(geometry):
    polygons = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        polygons = [polygons]
    points = [point for polygon in polygons for ring in polygon for point in ring]
    return (
        min(p[0] for p in points),
        min(p[1] for p in points),
        max(p[0] for p in points),
        max(p[1] for p in points),
    )


def cell_key(longitude, latitude, level):
    size = 1 << level
    return min(size - 1, math.floor((longitude + 180) / 360 * size)), min(
        size - 1, math.floor((latitude + 90) / 180 * size)
    )


def cell_bounds(x, y, level):
    size = 1 << level
    return [
        x / size * 360 - 180,
        y / size * 180 - 90,
        (x + 1) / size * 360 - 180,
        (y + 1) / size * 180 - 90,
    ]


def update_cells(session, field):
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    dialect = session.bind.dialect.name
    insert = pg_insert if dialect == "postgresql" else sqlite_insert
    least = func.least if dialect == "postgresql" else func.min
    greatest = func.greatest if dialect == "postgresql" else func.max
    for level in LEVELS:
        x, y = cell_key(field.centroid_lon, field.centroid_lat, level)
        statement = insert(MapCell).values(
            level=level,
            x=x,
            y=y,
            count=1,
            area=field.area,
            min_lon=field.min_lon,
            min_lat=field.min_lat,
            max_lon=field.max_lon,
            max_lat=field.max_lat,
        )
        session.execute(
            statement.on_conflict_do_update(
                index_elements=["level", "x", "y"],
                set_={
                    "count": MapCell.count + 1,
                    "area": MapCell.area + field.area,
                    "min_lon": least(MapCell.min_lon, field.min_lon),
                    "min_lat": least(MapCell.min_lat, field.min_lat),
                    "max_lon": greatest(MapCell.max_lon, field.max_lon),
                    "max_lat": greatest(MapCell.max_lat, field.max_lat),
                },
            )
        )


def rebuild_cells(connection):
    if connection.dialect.name == "postgresql":
        connection.execute(text("LOCK TABLE field_map_cells IN EXCLUSIVE MODE"))
    connection.execute(delete(MapCell))
    for level in LEVELS:
        size = 1 << level
        connection.execute(
            text("""
            INSERT INTO field_map_cells (level, x, y, count, area, min_lon, min_lat, max_lon, max_lat)
            SELECT :level, CAST(floor((centroid_lon + 180) / 360 * :size) AS INTEGER),
                   CAST(floor((centroid_lat + 90) / 180 * :size) AS INTEGER),
                   count(*), sum(area), min(min_lon), min(min_lat), max(max_lon), max(max_lat)
            FROM fields WHERE centroid_lon IS NOT NULL
            GROUP BY 2, 3
        """),
            dict(level=level, size=size),
        )


def summary(session):
    dataset = session.get(MapDataset, "csb-2025")
    if dataset:
        return dict(dataset.metadata_, defaultCenter=[42.05, -93.87], defaultZoom=11)
    from app.repositories.fields import FieldRecord

    row = session.execute(
        select(
            func.count(),
            func.min(FieldRecord.min_lon),
            func.min(FieldRecord.min_lat),
            func.max(FieldRecord.max_lon),
            func.max(FieldRecord.max_lat),
        )
    ).one()
    bounds = list(row[1:]) if row[0] else None
    center = [42.05, -93.87]
    if bounds:
        center = [(bounds[1] + bounds[3]) / 2, (bounds[0] + bounds[2]) / 2]
    return dict(
        total=row[0],
        bounds=bounds,
        defaultCenter=center,
        defaultZoom=13,
        source="User supplied",
        boundaryKind="user_geometry",
        importedAt=None,
    )


def spatial_filter(session, bounds):
    from app.repositories.fields import FieldRecord as F

    west, south, east, north = bounds
    if session.bind.dialect.name == "postgresql":
        return text(
            "box(point(min_lon, min_lat), point(max_lon, max_lat)) && "
            "box(point(:west, :south), point(:east, :north))"
        ).bindparams(west=west, south=south, east=east, north=north)
    return (F.min_lon <= east) & (F.max_lon >= west) & (F.min_lat <= north) & (F.max_lat >= south)


def cluster_feature(row, viewport_bounds):
    bounds = [row.min_lon, row.min_lat, row.max_lon, row.max_lat]
    west, south, east, north = viewport_bounds
    # A partial edge cell's center may be offscreen; retain a visible zoom target.
    lon_padding = (east - west) * 0.04
    lat_padding = (north - south) * 0.04
    longitude = max(west + lon_padding, min(east - lon_padding, (bounds[0] + bounds[2]) / 2))
    latitude = max(south + lat_padding, min(north - lat_padding, (bounds[1] + bounds[3]) / 2))
    return dict(
        type="Feature",
        id=f"cluster-{row.level}-{row.x}-{row.y}",
        geometry=dict(type="Point", coordinates=[longitude, latitude]),
        properties=dict(kind="cluster", count=row.count, area=round(row.area, 2), bounds=bounds),
    )


def overview(session, bounds, zoom):
    level = min(12, max(4, (int(zoom) + 3) // 2 * 2))
    while True:
        x0, y0 = cell_key(bounds[0], bounds[1], level)
        x1, y1 = cell_key(bounds[2], bounds[3], level)
        rows = list(
            session.scalars(
                select(MapCell)
                .where(MapCell.level == level, MapCell.x.between(x0, x1), MapCell.y.between(y0, y1))
                .limit(MAX_FEATURES + 1)
            )
        )
        if len(rows) <= MAX_FEATURES or level == LEVELS[0]:
            break
        level -= 2
    return dict(
        type="FeatureCollection",
        mode="clusters",
        bounds=list(bounds),
        total=sum(row.count for row in rows),
        features=[cluster_feature(row, bounds) for row in rows],
        limit=MAX_FEATURES,
        source="USDA NASS CSB 2025",
        approximate=True,
    )


def viewport(store, bounds, zoom):
    from app.repositories.fields import FieldRecord as F
    from app.repositories.fields import UserField

    session = store.session
    # Even a forged zoom cannot force a country-wide field scan.
    if zoom < 11 or bounds[2] - bounds[0] > 3 or bounds[3] - bounds[1] > 3:
        return overview(session, bounds, zoom)
    columns = [
        F.id,
        F.parcel_id,
        F.name,
        F.crop,
        F.area,
        F.source_id,
        F.boundary_kind,
        F.geometry,
        F.min_lon,
        F.min_lat,
        F.max_lon,
        F.max_lat,
    ]
    rows = session.execute(
        select(*columns).where(spatial_filter(session, bounds)).limit(MAX_FEATURES + 1)
    ).all()
    if len(rows) > MAX_FEATURES:
        return overview(session, bounds, min(zoom, 10))
    ids = [row.id for row in rows]
    selected = (
        set(
            session.scalars(
                select(UserField.field_id).where(
                    UserField.user_id == store.user_id, UserField.field_id.in_(ids)
                )
            )
        )
        if ids
        else set()
    )
    features = []
    for row in rows:
        features.append(
            dict(
                type="Feature",
                id=row.id,
                geometry=row.geometry
                or rectangle((row.min_lon, row.min_lat, row.max_lon, row.max_lat)),
                properties=dict(
                    kind="field",
                    parcelId=row.parcel_id,
                    catalogFieldId=row.id,
                    fieldId=row.id if row.id in selected else None,
                    sourceId=row.source_id,
                    name=row.name,
                    area=row.area,
                    crop=row.crop,
                    boundaryKind=row.boundary_kind,
                ),
            )
        )
    return dict(
        type="FeatureCollection",
        mode="fields",
        bounds=list(bounds),
        total=len(rows),
        features=features,
        limit=MAX_FEATURES,
        source="USDA NASS CSB 2025",
        approximate=True,
    )
