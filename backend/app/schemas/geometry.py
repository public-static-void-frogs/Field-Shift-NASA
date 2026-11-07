from math import isfinite
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator


def validate_polygon(rings):
    if not rings:
        raise ValueError("A polygon requires an exterior ring")
    for ring in rings:
        if len(ring) < 4 or ring[0] != ring[-1] or len(set(ring[:-1])) < 3:
            raise ValueError("Rings require three distinct vertices and a closing point")
        if any(
            not isfinite(x) or not isfinite(y) or not -180 <= x <= 180 or not -90 <= y <= 90
            for x, y in ring
        ):
            raise ValueError("Coordinates must be finite longitude/latitude pairs")
    return rings


class PolygonGeometry(BaseModel):
    type: Literal["Polygon"]
    coordinates: list[list[tuple[float, float]]]

    @field_validator("coordinates")
    @classmethod
    def valid_coordinates(cls, rings):
        return validate_polygon(rings)


class MultiPolygonGeometry(BaseModel):
    type: Literal["MultiPolygon"]
    coordinates: list[list[list[tuple[float, float]]]]

    @field_validator("coordinates")
    @classmethod
    def valid_coordinates(cls, polygons):
        if not polygons:
            raise ValueError("A multipolygon requires at least one polygon")
        return [validate_polygon(rings) for rings in polygons]


Geometry = Annotated[PolygonGeometry | MultiPolygonGeometry, Field(discriminator="type")]
