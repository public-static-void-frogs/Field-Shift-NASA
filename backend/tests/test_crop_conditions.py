import unittest
from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
from support import isolated_app, register
from weather_fixture import provider_payload

from app.core.config import Settings
from app.repositories.demo import DemoRepository
from app.schemas.weather import WeatherSeries
from app.services.crop_conditions import HeuristicCropConditionModel, assessment_context
from app.services.weather import WeatherService


class CropConditionsTests(unittest.TestCase):
    def setUp(self):
        self.store = DemoRepository()
        self.field = self.store.fields()[0]
        self.preferences = SimpleNamespace(
            latitude=50.45,
            longitude=30.52,
            time_zone="Europe/Kyiv",
            units="metric",
            location="Kyiv",
        )
        self.calls = []

        def respond(request):
            self.calls.append(request)
            data = provider_payload(dict(request.url.params))
            count = len(data["daily"]["time"])
            data["daily"]["temperature_2m_max"] = [18] * count
            data["daily"]["temperature_2m_min"] = [12] * count
            return httpx.Response(200, json=data)

        self.service = WeatherService(
            Settings(), httpx.Client(transport=httpx.MockTransport(respond))
        )
        self.addCleanup(self.service.close)
        self.model = HeuristicCropConditionModel()

    def predict(self, series=None, field=None):
        series = series or self.service.forecast(self.preferences)
        return self.model.predict(series, assessment_context(series, field or self.field))

    def test_complete_result_is_valid_and_contains_reusable_inputs_and_model_provenance(self):
        result = WeatherSeries.model_validate(self.predict())
        self.assertEqual(result.cropAssessment.model.kind, "heuristic_stub")
        self.assertEqual(result.cropAssessment.context.crop, self.field["crop"])
        self.assertEqual(
            result.cropAssessment.context.soil.soilPh, self.field["properties"]["soil"]["soilPh"]
        )
        self.assertEqual(
            set(result.cropAssessment.bounds),
            {"temperature", "moisture", "rainfall", "humidity", "wind"},
        )
        self.assertEqual(result.records[0].cropAssessment.riskLevel, "good")
        self.assertEqual(result.records[0].cropAssessment.coverage, "complete")
        self.assertTrue(0 <= result.records[0].cropAssessment.suitabilityScore <= 100)

    def test_night_frost_and_metric_extremes_create_structured_alerts(self):
        series = self.service.forecast(self.preferences)
        series["records"][0].update(low=-5, wind=50, rainfall=40)
        result = self.predict(series)
        day = result["records"][0]["cropAssessment"]
        self.assertEqual(day["riskLevel"], "high")
        self.assertEqual(day["metrics"]["temperature"]["valueRiskLevel"], "good")
        self.assertEqual(day["metrics"]["temperature"]["lowRiskLevel"], "high")
        self.assertTrue(
            any(a["reading"] == "low" and a["code"] == "below_critical" for a in day["alerts"])
        )
        self.assertTrue(
            any(a["metric"] == "wind" and a["severity"] == "high" for a in day["alerts"])
        )
        self.assertEqual(series["records"][0].get("cropAssessment"), None)

    def test_crop_soil_and_weather_window_influence_bounds(self):
        series = self.service.forecast(self.preferences)
        first = self.predict(series)["cropAssessment"]["bounds"]
        other = deepcopy(self.field)
        other["crop"] = "Corn"
        other["properties"]["soil"].update(
            soilType="Sandy loam", waterCapacity=100, organicMatter=2
        )
        second = self.predict(series, other)["cropAssessment"]["bounds"]
        self.assertNotEqual(first["temperature"], second["temperature"])
        self.assertNotEqual(first["moisture"], second["moisture"])
        self.assertNotEqual(first["rainfall"], second["rainfall"])
        for day in series["records"]:
            day["temperature"] = 35
        warm = self.predict(series)["cropAssessment"]["bounds"]
        self.assertNotEqual(first["temperature"]["ideal"], warm["temperature"]["ideal"])

    def test_missing_and_partial_readings_never_imply_good_conditions(self):
        series = self.service.forecast(self.preferences)
        for key in ("temperature", "low", "rainfall", "humidity", "wind", "moisture"):
            series["records"][0][key] = None
        missing = self.predict(series)["records"][0]["cropAssessment"]
        self.assertIsNone(missing["suitabilityScore"])
        self.assertEqual(missing["coverage"], "unavailable")
        self.assertEqual(missing["riskLevel"], "unknown")
        self.assertEqual(missing["alerts"], [])
        series["records"][0]["temperature"] = 18
        partial = self.predict(series)["records"][0]["cropAssessment"]
        self.assertEqual(partial["coverage"], "partial")
        self.assertEqual(partial["riskLevel"], "unknown")

    def test_equivalent_units_preserve_scores_risks_and_converted_limits(self):
        series = self.service.forecast(self.preferences)
        series["records"][0].update(temperature=16, low=-4, rainfall=20, wind=40)
        metric = self.predict(series)
        imperial = deepcopy(series)
        imperial["units"].update(temperature="°F", rainfall="in", wind="mph")
        for day in imperial["records"]:
            for key in ("temperature", "low"):
                day[key] = day[key] * 9 / 5 + 32
            day["rainfall"] /= 25.4
            day["wind"] /= 1.609344
        converted = self.predict(imperial)
        a, b = metric["records"][0]["cropAssessment"], converted["records"][0]["cropAssessment"]
        self.assertEqual(a["suitabilityScore"], b["suitabilityScore"])
        self.assertEqual(a["metrics"], b["metrics"])
        low = metric["cropAssessment"]["bounds"]["temperature"]["criticalLow"]
        self.assertEqual(
            converted["cropAssessment"]["bounds"]["temperature"]["criticalLow"], low * 9 / 5 + 32
        )
        self.assertEqual(converted["cropAssessment"]["bounds"]["rainfall"]["unit"], "in")

    def test_scoped_routes_use_field_geometry_time_zone_and_validate_ids_before_weather(self):
        directory, app = isolated_app()
        self.addCleanup(directory.cleanup)
        self.addCleanup(app.state.engine.dispose)
        app.state.weather.close()
        app.state.weather = self.service
        with TestClient(app) as client:
            registered = register(client, latitude=50.45, longitude=30.52)
            self.assertEqual(registered.status_code, 201, registered.text)
            settings = client.get("/api/v1/users/me/settings").json()
            settings["timeZone"] = "Europe/Kyiv"
            self.assertEqual(
                client.put("/api/v1/users/me/settings", json=settings).status_code, 200
            )
            fid = self.field["id"]
            response = client.get(f"/api/v1/weather/forecast?field_id={fid}")
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()
            self.assertEqual(result["cropAssessment"]["context"]["fieldId"], fid)
            self.assertEqual(result["timeZone"], "America/Chicago")
            self.assertNotEqual(result["latitude"], 50.45)
            self.assertEqual(client.get("/api/v1/weather/forecast?field_id=nope").status_code, 422)
            self.assertEqual(
                client.get(f"/api/v1/weather/forecast?field_id={uuid4()}").status_code, 404
            )
            self.assertEqual(len(self.calls), 1)
            response = client.get(
                f"/api/v1/weather/history?field_id={fid}&start_date=2025-07-01&end_date=2025-07-07"
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(
                response.json()["cropAssessment"]["context"]["climate"]["source"], "history_window"
            )
            self.assertIsNone(client.get("/api/v1/weather/forecast").json()["cropAssessment"])
