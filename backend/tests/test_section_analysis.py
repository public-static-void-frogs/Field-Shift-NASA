"""Focused geometry, fake-input provenance and endpoint failure checks."""

import importlib.util
import unittest
from types import SimpleNamespace

from fastapi.testclient import TestClient
from support import isolated_app

from app.services.ml.synthetic_crop_inputs import SYNTHETIC_SEQUENCE, synthetic_sequences

HAS_GEOMETRY = all(importlib.util.find_spec(name) for name in ("cv2", "numpy", "shapely", "pyproj"))


class SyntheticInputTests(unittest.TestCase):
    def test_explicit_fake_input_shape_and_bounded_reproducible_noise(self):
        sequences = synthetic_sequences(20, 42)
        self.assertEqual(sequences, synthetic_sequences(20, 42))
        self.assertNotEqual(sequences, synthetic_sequences(20, 43))
        for sequence in sequences:
            self.assertEqual(len(sequence), 16)
            for step, baseline in zip(sequence, SYNTHETIC_SEQUENCE):
                self.assertEqual(len(step), 3)
                for value, original in zip(step, baseline):
                    self.assertTrue(0 <= value <= 1)
                    self.assertLessEqual(abs(value - original), 0.025)


@unittest.skipUnless(HAS_GEOMETRY, "Install requirements-ml.txt for mask geometry checks")
class MaskGeometryTests(unittest.TestCase):
    def test_real_mask_component_preserves_holes_and_excludes_other_objects(self):
        import numpy as np
        from shapely.geometry import shape

        from app.services.ml.geometry import ImageProjection, field_geometry

        image = SimpleNamespace(bounds=(-94, 42, -93.99, 42.01), width=100, height=100)
        projection = ImageProjection(image)
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[10:70, 10:70] = 1
        mask[30:45, 30:45] = 0
        mask[80:95, 80:95] = 1
        result = field_geometry(mask, [20, 20], projection)
        self.assertEqual(len(result["geometry"]["coordinates"]), 2)
        self.assertLess(shape(result["geometry"]).bounds[2], -93.992)
        self.assertGreater(result["areaHa"], 0)
        self.assertFalse(result["touchesImageEdge"])
        self.assertIsNone(field_geometry(mask, [0, 0], projection))

    def test_mercator_latitude_is_not_linearly_interpolated(self):
        from app.services.ml.geometry import ImageProjection

        projection = ImageProjection(SimpleNamespace(bounds=(-1, 10, 1, 70), width=101, height=101))
        lon, lat = projection.geographic(50, 50)
        self.assertAlmostEqual(lon, 0)
        self.assertGreater(lat, 47)
        self.assertLess(lat, 48)
        pixel = projection.pixel((lon, lat))
        self.assertAlmostEqual(pixel[0], 50.5)
        self.assertAlmostEqual(pixel[1], 50.5)


class AnalysisEndpointTests(unittest.TestCase):
    def test_busy_model_returns_503_without_loading_or_fabricating_results(self):
        from app.schemas.section_analysis import SectionAnalysisRequest
        from app.services.section_analysis import AnalysisUnavailable, SectionAnalyzer

        analyzer = SectionAnalyzer()
        analyzer.lock.acquire()
        try:
            with self.assertRaises(AnalysisUnavailable):
                analyzer.analyze(None)
            self.assertFalse(analyzer.loaded)
        finally:
            analyzer.lock.release()
        # Contract rejects empty selections before any model operation.
        self.assertIn(
            "minItems", SectionAnalysisRequest.model_json_schema()["properties"]["points"]
        )

    def test_analyze_endpoint_requires_authentication(self):
        directory, app = isolated_app()
        try:
            with TestClient(app) as client:
                response = client.post("/api/v1/maps/sections/analyze", json={})
                self.assertEqual(response.status_code, 401)
        finally:
            directory.cleanup()
