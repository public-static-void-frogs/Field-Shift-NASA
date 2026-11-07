import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import insert
from support import create_field, isolated_app, register

from app.repositories.fields import FieldRecord
from app.services.maps import MAX_FEATURES, cluster_feature, rebuild_cells
from scripts.import_csb_bounds import source_record

BASE = "/api/v1"


class MapTests(unittest.TestCase):
    def setUp(self):
        self.directory, self.app = isolated_app()
        self.addCleanup(self.directory.cleanup)
        self.addCleanup(self.app.state.engine.dispose)
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        register(self.client)

    def viewport(self, bounds="-93.76,42.03,-93.72,42.06", zoom=15):
        response = self.client.get(BASE + "/maps/geojson", params=dict(bbox=bounds, zoom=zoom))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_bounds_and_zoom_are_required_and_validated(self):
        self.assertEqual(self.client.get(BASE + "/maps/geojson").status_code, 422)
        for bounds in [
            "1,2,3",
            "1,2,3,4,5",
            "nan,0,1,1",
            "-181,0,1,1",
            "0,0,0,1",
            "0,0,1,91",
            "1,1,0,0",
            "west,south,east,north",
        ]:
            self.assertEqual(
                self.client.get(
                    BASE + "/maps/geojson", params=dict(bbox=bounds, zoom=12)
                ).status_code,
                422,
            )
        for zoom in [-1, 21, "nan"]:
            self.assertEqual(
                self.client.get(
                    BASE + "/maps/geojson", params=dict(bbox="0,0,1,1", zoom=zoom)
                ).status_code,
                422,
            )

    def test_only_intersecting_fields_are_loaded_and_selection_is_private(self):
        field = create_field(self.client)
        create_field(
            self.client,
            geometry={"type": "Polygon", "coordinates": [[[30, 50], [31, 50], [31, 51], [30, 50]]]},
        )
        result = self.viewport()
        self.assertEqual(result["mode"], "fields")
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["features"][0]["id"], field["id"])
        self.assertEqual(result["features"][0]["properties"]["fieldId"], field["id"])
        with TestClient(self.app) as other:
            register(other, "maps-other@example.com")
            other_result = other.get(
                BASE + "/maps/geojson?bbox=-93.76,42.03,-93.72,42.06&zoom=15"
            ).json()
            self.assertNotIn("fieldId", other_result["features"][0]["properties"])
        self.assertEqual(self.viewport("0,0,1,1")["features"], [])

    def test_low_zoom_groups_all_fields_without_polygon_payloads(self):
        create_field(self.client)
        create_field(self.client)
        result = self.viewport("-180,-85,180,85", 2)
        self.assertEqual(result["mode"], "clusters")
        self.assertEqual(result["total"], 2)
        self.assertEqual(sum(f["properties"]["count"] for f in result["features"]), 2)
        self.assertTrue(all(f["geometry"]["type"] == "Point" for f in result["features"]))
        self.assertLessEqual(len(result["features"]), MAX_FEATURES)
        self.assertEqual(self.viewport("-180,-85,180,85", 19)["mode"], "clusters")

    def test_dense_views_group_instead_of_truncating_or_overloading_client(self):
        rows = [
            dict(
                id=str(uuid4()),
                name=f"Field {i}",
                crop=None,
                area=1,
                attributes={},
                boundary_kind="estimated_bounds",
                min_lon=-93.74,
                min_lat=42.04,
                max_lon=-93.739,
                max_lat=42.041,
                centroid_lon=-93.7395,
                centroid_lat=42.0405,
            )
            for i in range(MAX_FEATURES + 1)
        ]
        with self.app.state.engine.begin() as connection:
            connection.execute(insert(FieldRecord), rows)
            rebuild_cells(connection)
        result = self.viewport()
        self.assertEqual(result["mode"], "clusters")
        self.assertEqual(result["total"], MAX_FEATURES + 1)
        self.assertEqual(
            sum(f["properties"]["count"] for f in result["features"]), MAX_FEATURES + 1
        )
        self.assertLessEqual(len(result["features"]), MAX_FEATURES)

    def test_source_import_preserves_identity_area_quality_and_unknown_measurements(self):
        values = (
            "351825000000001",
            8.014266533798391,
            "35",
            "059",
            "Union",
            -103.249433,
            35.853277,
            -103.247581,
            35.855003,
            -103.248507,
            35.85414,
        )
        record = source_record(values, datetime.now(timezone.utc))
        self.assertEqual(record[0], source_record(values, datetime.now(timezone.utc))[0])
        row = FieldRecord(
            id=record[0],
            name=record[1],
            crop=None,
            area=record[3],
            attributes={},
            source_id=record[7],
            boundary_kind=record[8],
            state_fips=record[9],
            county_fips=record[10],
            county=record[11],
            min_lon=record[12],
            min_lat=record[13],
            max_lon=record[14],
            max_lat=record[15],
            centroid_lon=record[16],
            centroid_lat=record[17],
        )
        with self.app.state.sessions() as session:
            session.add(row)
            session.commit()
        fid = record[0]
        field = self.client.get(BASE + f"/fields/catalog/{fid}").json()
        self.assertEqual(field["boundaryKind"], "estimated_bounds")
        self.assertEqual(field["sourceId"], values[0])
        self.assertAlmostEqual(field["area"], values[1] * 0.40468564224)
        self.assertIsNone(field["crop"])
        self.assertIsNone(field["health"])
        self.assertEqual(field["geometry"]["coordinates"][0][0], [values[5], values[6]])
        self.assertEqual(self.client.put(BASE + f"/fields/{fid}/selection").status_code, 200)
        self.assertEqual(self.client.get(BASE + "/overview/charts").status_code, 200)
        self.assertEqual(
            self.client.get(BASE + "/overview/charts").json()["cropAreas"][0]["name"],
            "Not supplied",
        )
        self.assertEqual(self.client.get(BASE + f"/fields/{fid}/properties").status_code, 404)

    def test_catalog_is_paginated_and_summary_is_small(self):
        create_field(self.client)
        create_field(self.client)
        response = self.client.get(BASE + "/fields/catalog?limit=1")
        self.assertEqual(len(response.json()), 1)
        second = self.client.get(BASE + "/fields/catalog?limit=1&offset=1").json()
        self.assertNotEqual(response.json()[0]["id"], second[0]["id"])
        self.assertEqual(self.client.get(BASE + "/fields/catalog?limit=501").status_code, 422)
        summary = self.client.get(BASE + "/maps/summary").json()
        self.assertEqual(summary["total"], 2)
        self.assertIn("defaultCenter", summary)

    def test_partial_edge_groups_keep_a_visible_zoom_target(self):
        cell = SimpleNamespace(
            level=6,
            x=10,
            y=20,
            count=100,
            area=200,
            min_lon=-99.0,
            min_lat=40.0,
            max_lon=-98.0,
            max_lat=41.0,
        )
        view = (-98.1, 40.9, -98.0, 41.0)
        feature = cluster_feature(cell, view)
        longitude, latitude = feature["geometry"]["coordinates"]
        self.assertTrue(view[0] <= longitude <= view[2])
        self.assertTrue(view[1] <= latitude <= view[3])
        self.assertEqual(feature["properties"]["bounds"], [-99.0, 40.0, -98.0, 41.0])
