import json
import unittest
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.planning import planting_date

BASE = "/api/v1"


class ApiTests(unittest.TestCase):
    def test_compatibility_entry_point_exports_asgi_app(self):
        from fastapi import FastAPI
        from uvicorn.importer import import_from_string

        self.assertIsInstance(import_from_string("main:app"), FastAPI)

    def setUp(self):
        self.client = TestClient(create_app())

    def get(self, path):
        response = self.client.get(BASE + path)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_all_read_resources_and_weather_ranges(self):
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
        for field in self.get("/fields"):
            for resource in [
                "",
                "/properties",
                "/history",
                "/recommendation",
                "/rotation",
                "/strategy",
                "/events",
            ]:
                self.get(f"/fields/{field['id']}{resource}")

    def test_validated_inputs_and_missing_resources(self):
        for payload in [
            dict(parcelId=6, name=" ", crop="Corn"),
            dict(parcelId=6, name="x" * 61, crop="Corn"),
            dict(parcelId=6, name="Test", crop="Unknown"),
            dict(parcelId=-1, name="Test", crop="Corn"),
            dict(parcelId=True, name="Test", crop="Corn"),
        ]:
            self.assertEqual(self.client.post(BASE + "/fields", json=payload).status_code, 422)
        for path in [
            "/fields/99",
            "/fields/99/history",
            "/fields/99/strategy",
            "/fields/99/events",
            "/parcels/99",
        ]:
            self.assertEqual(self.client.get(BASE + path).status_code, 404)
        for path in [
            "/weather/history?days=8",
            "/overview/charts?days=0",
            "/overview/charts?days=366",
            "/overview/charts?metric=bogus",
        ]:
            self.assertEqual(self.client.get(BASE + path).status_code, 422)
        self.assertEqual(
            self.client.put(
                BASE + "/fields/1/strategy/response", json={"status": "completed"}
            ).status_code,
            422,
        )
        self.assertEqual(self.client.delete(BASE + "/fields/99").status_code, 404)

    def test_create_respond_remove_updates_all_derived_resources(self):
        payload = dict(parcelId=6, name='  New field "🌾"  ', crop="Corn")
        created = self.client.post(BASE + "/fields", json=payload)
        self.assertEqual(created.status_code, 201)
        field = created.json()
        self.assertEqual(field["name"], payload["name"].strip())
        self.assertEqual(self.client.post(BASE + "/fields", json=payload).status_code, 409)
        events = self.get("/fields/6/events")
        self.assertTrue(all(event["fieldName"] == field["name"] for event in events))
        self.assertEqual(self.get("/fields/6/strategy")["plan"]["currentCrop"], "Corn")
        self.assertIn("field-6", self.get("/overview/charts")["trends"][0])
        for status in ["accepted", "declined", "proposed"]:
            response = self.client.put(
                BASE + "/fields/6/strategy/response", json={"status": status}
            )
            self.assertEqual(response.status_code, 200)
            responses = response.json()
            self.assertEqual(responses, self.get("/planning/responses"))
            for event in events:
                if status == "proposed":
                    self.assertNotIn(event["id"], responses)
                else:
                    self.assertEqual(responses[event["id"]]["status"], status)
                    self.assertEqual(
                        json.loads(responses[event["id"]]["fingerprint"]),
                        [
                            event[k]
                            for k in ("id", "fieldId", "date", "title", "description", "duration")
                        ],
                    )
        self.client.put(BASE + "/fields/6/strategy/response", json={"status": "declined"})
        self.assertEqual(self.client.delete(BASE + "/fields/6").json(), 6)
        self.assertFalse(any(e["fieldId"] == 6 for e in self.get("/planning/events")))
        self.assertFalse(any(key.startswith("field-6-") for key in self.get("/planning/responses")))
        self.assertNotIn("field-6", self.get("/overview/charts")["trends"][0])

    def test_recreated_parcels_support_every_crop(self):
        for parcel in range(1, 7):
            if parcel < 6:
                self.client.delete(f"{BASE}/fields/{parcel}")
            for crop in ["Corn", "Soybeans", "Winter wheat"]:
                response = self.client.post(
                    BASE + "/fields", json=dict(parcelId=parcel, crop=crop, name=f"Field {parcel}")
                )
                self.assertEqual(response.status_code, 201)
                for resource in ["properties", "history", "strategy", "recommendation"]:
                    self.get(f"/fields/{parcel}/{resource}")
                events = self.get(f"/fields/{parcel}/events")
                harvest = next(e for e in events if e["category"] == "Harvest")
                seedbed = next(e for e in events if e["id"].endswith("-seedbed"))
                planting = next(e for e in events if e["id"].endswith("-rotation-2027"))
                self.assertLess(harvest["date"], seedbed["date"])
                self.assertLess(seedbed["date"], planting["date"])
                self.client.delete(f"{BASE}/fields/{parcel}")

    def test_duplicate_creation_is_atomic(self):
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(
                executor.map(
                    lambda _: (
                        self.client.post(
                            BASE + "/fields",
                            json=dict(parcelId=6, name="Concurrent", crop="Soybeans"),
                        ).status_code
                    ),
                    range(2),
                )
            )
        self.assertEqual(sorted(results), [201, 409])

    def test_decisions_are_isolated_and_deleting_a_field_updates_notifications(self):
        self.client.put(BASE + "/fields/1/strategy/response", json={"status": "accepted"})
        before = self.get("/planning/responses")
        self.client.put(BASE + "/fields/2/strategy/response", json={"status": "declined"})
        after = self.get("/planning/responses")
        self.assertTrue(all(after[key] == value for key, value in before.items()))
        self.client.delete(BASE + "/fields/2")
        self.assertFalse(any(item.get("fieldId") == 2 for item in self.get("/notifications")))
        self.assertEqual(self.get("/planning/responses"), before)

    def test_cors_and_openapi(self):
        response = self.client.options(
            BASE + "/fields",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")
        response = self.client.options(
            BASE + "/fields",
            headers={
                "Origin": "https://untrusted.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertEqual(response.status_code, 400)
        spec = self.client.get("/openapi.json").json()
        self.assertIn("/api/v1/fields", spec["paths"])
        self.assertIn("201", spec["paths"]["/api/v1/fields"]["post"]["responses"])

    def test_planting_windows(self):
        self.assertEqual(
            planting_date("Soybeans", 6.5, 64),
            dict(
                date="2027-04-22",
                windowEnd="2027-05-02",
                soilPreparationDays=0,
                moistureReviewDays=0,
            ),
        )
        self.assertEqual(
            planting_date("Soybeans", 5.6, 32),
            dict(
                date="2027-05-02",
                windowEnd="2027-05-12",
                soilPreparationDays=7,
                moistureReviewDays=3,
            ),
        )
        self.assertEqual(planting_date("Winter wheat", 6.8, 58)["date"], "2026-09-25")
