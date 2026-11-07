"""Explicit development stand-in. No image inference, catalog writes or saved field selection."""

import math
import random
from uuid import uuid4

from app.schemas.section_analysis import SectionAnalysisRequest


def mock_analysis(payload: SectionAnalysisRequest):
    randomizer = random.SystemRandom()
    fields = []
    for point in payload.points:
        longitude, latitude = point.coordinates
        half_size_m = randomizer.uniform(25, 95)
        lat_radius = half_size_m / 111_320
        lon_radius = lat_radius / max(0.05, math.cos(math.radians(latitude)))
        lon = max(-179.99, min(179.99, longitude + randomizer.uniform(-0.08, 0.08) * lon_radius))
        lat = max(-89.99, min(89.99, latitude + randomizer.uniform(-0.08, 0.08) * lat_radius))
        west, east = max(-180, lon - lon_radius), min(180, lon + lon_radius)
        south, north = max(-90, lat - lat_radius), min(90, lat + lat_radius)
        fields.append(
            dict(
                id=uuid4(),
                pointId=point.id,
                crop=randomizer.choice(("Winter wheat", "Corn", "Soybeans")),
                center=[lon, lat],
                geometry=dict(
                    type="Polygon",
                    coordinates=[
                        [
                            [west, south],
                            [east, south],
                            [east, north],
                            [west, north],
                            [west, south],
                        ]
                    ],
                ),
                areaHa=round((2 * half_size_m) ** 2 / 10_000, 3),
            )
        )
    return dict(requestId=uuid4(), mock=True, model="mock-field-detector-v1", fields=fields)
