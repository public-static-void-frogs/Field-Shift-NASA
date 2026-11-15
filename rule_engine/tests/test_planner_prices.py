"""What the planner may know about prices when it plans, and the year chain that starts from it."""

import math
import unittest

import numpy as np

from rule_engine import build_advisor
from rule_engine.planner import RotationModel, build_context, exact_plan, tabular
from rule_engine.planner.prices import (
    OUTLOOK_SERIES,
    _outlook,
    deviations,
    expected_us_price,
    harvest_levels,
    known,
    persistence,
)
from rule_engine.planner.sampler import _history_rows, _series
from rule_engine.tests.test_planner import FIXTURES, field, several_years


class PriceTimingTests(unittest.TestCase):
    def test_marketing_years_are_known_through_two_years_before_the_plan(self):
        history = {y: 4.0 for y in range(2015, 2027)}
        self.assertEqual(max(known(history, 2027)), 2025)
        self.assertEqual(known(history, None), history)

    def test_a_steady_real_decline_is_not_a_price_deviation(self):
        from rule_engine.planner.prices import cpi

        table = cpi()
        years = [y for y in sorted(table) if y >= 1990]
        # nominal prices that fall 2 % a year in constant dollars: every year sits on the trend
        history = {y: table[y] * math.exp(-0.02 * (y - 1990)) for y in years}
        for value in deviations(history).values():
            self.assertAlmostEqual(value, 1.0, places=6)

    def test_harvest_levels_stop_the_autumn_before_the_plan(self):
        levels = harvest_levels("corn", 2025)
        self.assertEqual(max(levels), 2024)

    def test_outlook_moves_the_baseline_by_the_latest_wasde(self):
        us, _, _ = _series(_history_rows(), "price", "corn", "US")
        rho = 0.5
        got = expected_us_price("corn", 2027, us, rho)
        base = _outlook("corn", 2027, "baseline")
        shift = (_outlook("corn", 2026, "wasde") / _outlook("corn", 2026, "baseline")) ** rho
        self.assertEqual(got.method, "outlook")
        self.assertAlmostEqual(got.price, base * shift)

    def test_a_plan_sees_only_outlooks_published_by_the_autumn_before(self):
        from unittest import mock

        rows = {
            ("corn", 2021): [
                {"kind": "baseline", "price_usd": "3.6", "published": "2020-02"},
                {"kind": "baseline", "price_usd": "4.3", "published": "2021-02"},
            ]
        }
        with mock.patch("rule_engine.planner.prices.outlooks", return_value=rows):
            self.assertEqual(_outlook("corn", 2021, "baseline", "2020-11-30"), 3.6)
            self.assertEqual(_outlook("corn", 2021, "baseline"), 4.3)
            self.assertIsNone(_outlook("corn", 2021, "baseline", "2019-11-30"))

    def test_without_an_outlook_the_september_price_is_carried_forward(self):
        us, _, _ = _series(_history_rows(), "price", "peanuts", "US")
        self.assertNotIn("peanuts", OUTLOOK_SERIES)
        flat, carried = (expected_us_price("peanuts", 2027, us, rho) for rho in (0.0, 1.0))
        self.assertEqual(flat.method, "autoregressive")
        self.assertNotAlmostEqual(flat.price, carried.price)
        self.assertIsNone(expected_us_price("peanuts", 1960, us, 0.5))  # nothing known then

    def test_persistence_is_a_correlation(self):
        series = [_series(_history_rows(), "price", c, "US")[0] for c in ("corn", "soybeans")]
        self.assertTrue(0.0 <= persistence(series) <= 1.0)


class PlanYearTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.advisor = build_advisor()
        cls.record = field()
        base = build_context(cls.record, cls.advisor, [FIXTURES], reference_aws_mm=180.0)
        cls.seasons = several_years(base).seasons  # 2019-2025
        cls.crops = ("corn", "soybeans", "oats")

    def model(self, plan_year, **context):
        base = build_context(
            self.record,
            self.advisor,
            [FIXTURES],
            reference_aws_mm=180.0,
            plan_year=plan_year,
            **context,
        )
        seasons = {y: s for y, s in self.seasons.items() if plan_year is None or y < plan_year}
        from dataclasses import replace

        context = replace(base, seasons=seasons)
        return RotationModel(context, self.advisor, crops=self.crops, horizon=3)

    def test_build_context_drops_the_seasons_from_the_plan_year_on(self):
        context = build_context(self.record, self.advisor, [FIXTURES], plan_year=2025)
        self.assertTrue(all(y < 2025 for y in context.seasons))
        self.assertEqual(context.plan_year, 2025)

    def test_no_marketing_year_price_after_two_years_before_the_plan(self):
        model = self.model(2025)  # planned in the autumn of 2024
        for crop, basis in model.sampler.basis.items():
            draw = {y.year: y.crops[crop].price for y in model.years}
            # the 2024/25 marketing year is not over: that season is drawn at the expected price
            self.assertAlmostEqual(draw[2024], basis.price)
            self.assertNotAlmostEqual(draw[2023], basis.price)  # 2023/24 is final
            self.assertEqual(max(basis.harvest_levels), 2024)

    def test_the_outlook_sets_the_expected_corn_price(self):
        model = self.model(2027)
        basis = model.sampler.basis["corn"]
        self.assertEqual(basis.price_level, "outlook")
        self.assertIn("USDA baseline 2027", basis.price_source)

    def test_the_plan_starts_after_the_current_year_when_it_is_not_drawable(self):
        model = self.model(2027)
        chain, n = model.chain, len(model.years)
        self.assertEqual(chain.labels[-1], 2026)
        self.assertEqual(chain.labels[chain.latest], 2026)
        self.assertEqual(len(chain.matrix), n + 1)
        self.assertTrue(all(len(row) == n for row in chain.matrix))
        self.assertIsNone(chain.end[2026]["drought"])
        self.assertEqual(model.initial_state.prev, n)
        plan = exact_plan(model)
        self.assertEqual(len(plan.steps), 3)
        table = tabular.tabulate(model)
        self.assertEqual(table.first, n)
        np.testing.assert_allclose(table.odds[n, :n], chain.matrix[n], rtol=1e-5)

    def test_a_past_plan_starts_after_its_last_season(self):
        model = self.model(2025)
        self.assertEqual(max(y.year for y in model.years), 2024)
        self.assertEqual(model.chain.labels[model.chain.latest], 2024)
        self.assertEqual(len(model.chain.matrix), len(model.years))

    def test_the_outcome_model_draws_the_observed_year_at_its_trend(self):
        past = self.model(2025)
        seen = self.model(None, trend_year=2025)
        self.assertIn(2025, [y.year for y in seen.years])
        self.assertNotIn(2025, [y.year for y in past.years])


if __name__ == "__main__":
    unittest.main()
