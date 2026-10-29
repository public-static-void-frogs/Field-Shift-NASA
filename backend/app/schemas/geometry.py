from typing import Annotated, Literal

from pydantic import BaseModel, Field


class PolygonGeometry(BaseModel):
    type: Literal["Polygon"]
    coordinates: list[list[tuple[float, float]]]


class MultiPolygonGeometry(BaseModel):
    type: Literal["MultiPolygon"]
    coordinates: list[list[list[tuple[float, float]]]]


Geometry = Annotated[PolygonGeometry | MultiPolygonGeometry, Field(discriminator="type")]
