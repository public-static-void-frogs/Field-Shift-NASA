import json
import shutil
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from support import isolated_app, register
from uvicorn.importer import import_from_string

from app.repositories.demo import REFERENCES, DemoRepository
from app.services.planning_builder import planting_date

BASE = "/api/v1"
DATA = Path(__file__).parents[1] / "app/data"


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.directory, self.app = isolated_app()
        self.addCleanup(self.directory.cleanup)
        self.addCleanup(self.app.state.engine.dispose)
        self.store = self.app.state.repository
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.assertEqual(register(self.client).status_code, 201)
        self.fields = self.get("/fields")
        self.first, self.second = (row["id"] for row in self.fields[:2])
        self.missing = str(uuid4())

    def get(self, path):
        response = self.client.get(BASE + path)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def create(self, parcel=6, crop="Corn"):
        response = self.client.post(
            BASE + "/fields", json=dict(parcelId=parcel, name='New field "🌾"', crop=crop)
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_compatibility_entry_point_exports_asgi_app(self):
        self.assertIsInstance(import_from_string("main:app"), FastAPI)

    def test_all_collections_are_record_arrays_with_unique_keys_and_valid_references(self):
        for path in DATA.glob("*.json"):
            records = json.loads(path.read_text())
            self.assertIsInstance(records, list, path.name)
            self.assertEqual(len(records), len({row["id"] for row in records}), path.name)
        self.store.validate()
        for row in self.store.all("fields"):
            self.assertEqual(str(UUID(row["id"])), row["id"])
            self.assertNotIn("crop", row)
            self.assertNotIn("history", row)
            self.assertIn("coordinates", row["geometry"])
            self.assertIn("soilProfileId", row["properties"])
        for row in self.store.all("planned_events"):
            self.assertNotIn("fieldName", row)
            self.assertIn("fieldId", row)
            self.assertEqual(str(UUID(row["id"])), row["id"])

    def test_all_api_resources_join_related_records(self):
        for path in [
            "/fields",
            "/crops",
            "/parcels/6",
            "/farm/profile",
            "/weather/current",
            "/maps/geojson",
            "/help/team",
            "/help/sources",
            "/notifications",
            "/overview/charts",
            "/planning/context",
            "/planning/events",
            "/planning/responses",
        ]:
            self.get(path)
        for days in [7, 30, 90]:
            self.assertEqual(len(self.get(f"/weather/history?days={days}")), days)
        for field in self.fields:
            fid = field["id"]
            for resource in [
                "",
                "/properties",
                "/history",
                "/recommendation",
                "/rotation",
                "/strategy",
                "/events",
            ]:
                self.get(f"/fields/{fid}{resource}")
            self.assertEqual(field["properties"], self.get(f"/fields/{fid}/properties"))
            self.assertTrue(
                all(row["fieldId"] == fid for row in self.get(f"/fields/{fid}/history")["events"])
            )
            strategy = self.get(f"/fields/{fid}/strategy")
            self.assertTrue(all(row["fieldId"] == fid for row in strategy["events"]))
            self.assertEqual(strategy["plan"]["currentCrop"], field["crop"])

    def test_joins_use_foreign_keys_not_collection_order_or_numeric_id_assumptions(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            for path in DATA.glob("*.json"):
                shutil.copy(path, directory / path.name)
            for path in directory.glob("*.json"):
                records = json.loads(path.read_text())
                path.write_text(json.dumps(list(reversed(records))))
            store = DemoRepository(directory)
            field = store.require_field(self.first)
            self.assertEqual(field["crop"], self.fields[0]["crop"])
            self.assertEqual(
                {key: field["properties"][key] for key in self.fields[0]["properties"]},
                self.fields[0]["properties"],
            )
            records = json.loads((directory / "crops.json").read_text())
            for row in records:
                if row["id"] == field["cropId"]:
                    row["name"] = "Updated catalog crop"
            (directory / "crops.json").write_text(json.dumps(records))
            self.assertEqual(
                DemoRepository(directory).require_field(self.first)["crop"], "Updated catalog crop"
            )

    def test_invalid_references_are_rejected_when_loading_collections(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            for path in DATA.glob("*.json"):
                shutil.copy(path, directory / path.name)
            rows = json.loads((directory / "history_events.json").read_text())
            rows[0]["fieldId"] = self.missing
            (directory / "history_events.json").write_text(json.dumps(rows))
            with self.assertRaisesRegex(ValueError, "Invalid reference history_events.fieldId"):
                DemoRepository(directory)

    def test_guid_validation_and_missing_resources(self):
        for invalid in ["1", "not-a-guid"]:
            self.assertEqual(self.client.get(f"{BASE}/fields/{invalid}").status_code, 422)
        for suffix in ["", "/history", "/strategy", "/events"]:
            self.assertEqual(
                self.client.get(f"{BASE}/fields/{self.missing}{suffix}").status_code, 404
            )
        for payload in [
            dict(parcelId=6, name=" ", crop="Corn"),
            dict(parcelId=6, name="x" * 61, crop="Corn"),
            dict(parcelId=6, name="Test", crop="Unknown"),
            dict(parcelId=True, name="Test", crop="Corn"),
        ]:
            self.assertEqual(self.client.post(BASE + "/fields", json=payload).status_code, 422)
        for route in [
            "/weather/history?days=8",
            "/overview/charts?days=0",
            "/overview/charts?metric=bogus",
        ]:
            self.assertEqual(self.client.get(BASE + route).status_code, 422)
        self.assertEqual(
            self.client.put(
                f"{BASE}/fields/{self.first}/strategy/response", json={"status": "completed"}
            ).status_code,
            422,
        )

    def test_create_respond_delete_and_recreate_use_distinct_guids_and_cascade_relations(self):
        created = self.create()
        fid = created["id"]
        self.assertEqual(UUID(fid).version, 4)
        self.assertEqual(created["parcelId"], 6)
        self.assertEqual(
            self.client.post(
                BASE + "/fields", json=dict(parcelId=6, name="Duplicate", crop="Corn")
            ).status_code,
            409,
        )
        self.store.validate()
        events = self.get(f"/fields/{fid}/events")
        self.assertTrue(events)
        self.assertNotIn(f"field-{fid}", self.get("/overview/charts")["trends"][0])
        self.assertIn(f"field-{fid}", self.get("/overview/charts")["trends"][-1])
        for status in ["accepted", "declined", "proposed"]:
            response = self.client.put(
                f"{BASE}/fields/{fid}/strategy/response", json={"status": status}
            )
            self.assertEqual(response.status_code, 200)
            decisions = response.json()
            self.assertEqual(decisions, self.get("/planning/responses"))
            for event in events:
                if status == "proposed":
                    self.assertNotIn(event["id"], decisions)
                else:
                    self.assertEqual(
                        json.loads(decisions[event["id"]]["fingerprint"]),
                        [
                            event[k]
                            for k in ("id", "fieldId", "date", "title", "description", "duration")
                        ],
                    )
        self.client.put(f"{BASE}/fields/{fid}/strategy/response", json={"status": "accepted"})
        self.assertTrue(
            all(
                row["eventId"] in {e["id"] for e in events}
                for row in self.store.all("event_responses")
            )
        )
        self.assertEqual(self.client.delete(f"{BASE}/fields/{fid}").json(), fid)
        self.store.validate()
        for table, refs in REFERENCES.items():
            if refs.get("fieldId") == "fields":
                self.assertFalse(self.store.related(table, "fieldId", fid), table)
        self.assertFalse(self.store.all("event_responses"))
        self.assertNotIn(f"field-{fid}", self.get("/overview/charts")["trends"][-1])
        recreated = self.create()
        self.assertNotEqual(recreated["id"], fid)
        self.assertEqual(self.get("/planning/responses"), {})

    def test_maps_join_current_field_to_parcel_and_update_after_create_and_delete(self):
        def parcel():
            return next(
                row
                for row in self.get("/maps/geojson")["features"]
                if row["properties"]["parcelId"] == 6
            )

        self.assertIsNone(parcel()["properties"]["fieldId"])
        created = self.create()
        self.assertEqual(parcel()["properties"]["fieldId"], created["id"])
        self.assertEqual(parcel()["geometry"], created["geometry"])
        self.client.delete(f"{BASE}/fields/{created['id']}")
        self.assertIsNone(parcel()["properties"]["fieldId"])

    def test_every_crop_can_be_created_and_has_joinable_planning_records(self):
        for crop in ["Corn", "Soybeans", "Winter wheat"]:
            field = self.create(crop=crop)
            fid = field["id"]
            self.store.validate()
            strategy = self.get(f"/fields/{fid}/strategy")
            self.assertEqual(strategy["plan"]["currentCrop"], crop)
            self.assertTrue(strategy["steps"])
            self.assertTrue(self.get(f"/fields/{fid}/history")["events"])
            self.client.delete(f"{BASE}/fields/{fid}")

    def test_atomic_duplicate_create_and_isolated_field_decisions(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(
                pool.map(
                    lambda _: (
                        self.client.post(
                            BASE + "/fields",
                            json=dict(parcelId=6, name="Concurrent", crop="Soybeans"),
                        ).status_code
                    ),
                    range(2),
                )
            )
        self.assertEqual(sorted(statuses), [201, 409])
        self.client.put(
            f"{BASE}/fields/{self.first}/strategy/response", json={"status": "accepted"}
        )
        baseline = self.get("/planning/responses")
        self.client.put(
            f"{BASE}/fields/{self.second}/strategy/response", json={"status": "declined"}
        )
        self.client.delete(f"{BASE}/fields/{self.second}")
        self.assertEqual(self.get("/planning/responses"), baseline)
        self.assertFalse(
            any(row.get("fieldId") == self.second for row in self.get("/notifications"))
        )
        self.store.validate()

    def test_cors_and_guid_openapi_contract(self):
        response = self.client.options(
            BASE + "/fields",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        spec = self.client.get("/openapi.json").json()
        self.assertEqual(
            spec["components"]["schemas"]["Field"]["properties"]["id"]["format"], "uuid"
        )
        parameter = spec["paths"]["/api/v1/fields/{field_id}"]["get"]["parameters"][0]
        self.assertEqual(parameter["schema"]["format"], "uuid")

    def test_planting_windows_use_crop_catalog_reference_data(self):
        crops = self.store.all("crops")
        self.assertEqual(planting_date("Soybeans", 6.5, 64, crops)["date"], "2027-04-22")
        self.assertEqual(planting_date("Soybeans", 5.6, 32, crops)["date"], "2027-05-02")
        self.assertEqual(planting_date("Winter wheat", 6.8, 58, crops)["date"], "2026-09-25")
