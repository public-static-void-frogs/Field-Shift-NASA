"""Real application -> real HTTP -> local Postman simulation; opt-in, never live weather."""

import os
import unittest

import httpx
from fastapi.testclient import TestClient
from support import isolated_app, register

from app.services.weather import WeatherService

SIMULATION = os.getenv("WEATHER_SIMULATION_URL")


@unittest.skipUnless(SIMULATION, "Set WEATHER_SIMULATION_URL to the local Postman member URL")
class WeatherSimulationTests(unittest.TestCase):
    def setUp(self):
        self.directory, self.app = isolated_app()
        self.addCleanup(self.directory.cleanup)
        self.addCleanup(self.app.state.engine.dispose)
        self.app.state.weather.close()
        self.config = self.app.state.config
        self.config.weather_forecast_url = SIMULATION + "/v1/forecast"
        self.config.weather_archive_url = SIMULATION + "/v1/archive"
        self.config.weather_timeout_seconds = 0.2
        self.app.state.weather = WeatherService(self.config)
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.addCleanup(self.app.state.weather.close)
        httpx.get(SIMULATION + "/__control", params={"mode": "success"})
        self.assertEqual(
            register(self.client, latitude=50.4501, longitude=30.5234).status_code, 201
        )

    def test_current_forecast_history_and_shared_cache_over_http(self):
        current = self.client.get("/api/v1/weather/current")
        forecast = self.client.get("/api/v1/weather/forecast")
        self.assertEqual(current.status_code, 200, current.text)
        self.assertEqual(forecast.status_code, 200, forecast.text)
        self.assertEqual(len(forecast.json()["records"]), 14)
        self.assertEqual(httpx.get(SIMULATION + "/__control").json()["requests"], 1)
        history = self.client.get(
            "/api/v1/weather/history?start_date=2025-07-01&end_date=2025-07-07"
        )
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual(len(history.json()["records"]), 7)
        self.assertEqual(history.json()["records"][0]["moisture"], 25)
        self.assertEqual(current.json()["windDirection"], 90)

    def test_failures_missing_values_and_timeout_over_http(self):
        for mode in ("rate_limit", "error", "malformed", "slow"):
            with self.subTest(mode=mode):
                httpx.get(SIMULATION + "/__control", params={"mode": mode})
                response = self.client.get("/api/v1/weather/forecast")
                self.assertEqual(response.status_code, 503, response.text)
                self.assertNotIn("records", response.json())
        httpx.get(SIMULATION + "/__control", params={"mode": "missing"})
        response = self.client.get("/api/v1/weather/forecast")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()["records"][0]["moisture"])
        self.assertIsNone(response.json()["records"][0]["rainfall"])
