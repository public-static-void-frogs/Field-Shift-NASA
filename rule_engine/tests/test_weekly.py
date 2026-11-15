import csv
import json
import math
import unittest
from dataclasses import replace
from datetime import date, timedelta

from rule_engine import build_advisor
from rule_engine.planner import RotationModel, build_context
from rule_engine.planner.weekly import (
    DATA,
    FALLOW,
    TIE_USD_PER_DAY,
    DailyWeather,
    Preferences,
    Spot,
    WeeklyPlanner,
    assume_recent_crops,
    load_date_responses,
    load_phenology,
    rotation_period,
    score_card,
    slope_factor,
    soil_loss_class,
    weekly_plan,
)
from rule_engine.tests.test_planner import FIXTURES, field

START = date(2026, 11, 15)


def year_of_weather(year: int, warmer: float = 0.0) -> list[tuple]:
    """A made-up Iowa-like year: (tmax C, tmin C, rain mm, reference evapotranspiration mm)."""
    days = 366 if year % 4 == 0 else 365
    rows = []
    for day in range(days):
        mean = 9.5 - 15.5 * math.cos(2 * math.pi * (day - 20) / 365) + warmer
        rain = 15.0 if 100 <= day <= 280 and day % 7 == 0 else 1.0
        rows.append((mean + 6, mean - 6, rain, max(0.5, 0.2 * mean)))
    return rows


def weather(warmer: float = 0.0, trend: float = 0.0, target_year: int | None = None):
    years = {y: year_of_weather(y, warmer + trend * (y - 2014)) for y in range(2014, 2028)}
    return DailyWeather(years, target_year)


def record(history=(1, 5, 1, 5, 1), om_pct=4.0):
    found = field(history)
    found["soil"].update(kw=0.32, om_pct=om_pct)
    return found


class WeeklyDataTests(unittest.TestCase):
    def test_phenology_is_the_states_or_flagged_as_borrowed(self):
        iowa = load_phenology("IA")
        self.assertEqual(iowa["corn"].region, "IA")
        self.assertGreater(iowa["corn"].heat, 1000)
        self.assertNotEqual(iowa["sorghum"].region, "IA")  # NASS reports no sorghum progress there
        self.assertEqual(iowa["sorghum"].method, "days")
        self.assertEqual(iowa["alfalfa"].method, "season")

    def test_every_weekly_crop_has_a_growing_time(self):
        with (DATA / "weekly_crops.csv").open() as handle:
            crops = {row["crop"] for row in csv.DictReader(handle)}
        for state in ("IA", "TX", "ND"):
            found = load_phenology(state)
            self.assertEqual(crops - set(found), set(), state)
        texas, dakota = load_phenology("TX"), load_phenology("ND")
        self.assertEqual((texas["cotton"].region, texas["cotton"].base_c), ("TX", 15.6))
        self.assertGreater(texas["cotton"].harvest_lag, 0)  # bolls open weeks before harvest
        self.assertEqual(dakota["sugarbeets"].region, "ND")
        self.assertEqual(dakota["durum_wheat"].region, "ND")
        chickpeas, lentils = dakota["chickpeas"], dakota["lentils"]  # no NASS chickpea series
        self.assertEqual(chickpeas.borrowed_from, "lentils")
        self.assertEqual((chickpeas.days, chickpeas.region), (lentils.days, lentils.region))

    def test_yield_falls_with_late_planting_and_stops_at_the_last_trial_date(self):
        corn = load_date_responses()["corn"]
        self.assertEqual(corn.relative(0), 1.0)
        self.assertEqual(corn.relative(-10), 1.0)  # never above the usual day
        self.assertLess(corn.relative(corn.last_day), corn.relative(10))
        self.assertIsNone(corn.relative(corn.last_day + 1))

    def test_slope_factor_reproduces_the_factsheet_table(self):
        self.assertAlmostEqual(slope_factor(6, 244), 1.91, places=2)
        self.assertAlmostEqual(slope_factor(2, 30.5), 0.20, places=2)

    def test_soil_loss_classes(self):
        self.assertEqual(soil_loss_class(2.0), "very low (tolerable)")
        self.assertEqual(soil_loss_class(15.0), "moderate")
        self.assertEqual(soil_loss_class(40.0), "severe")

    def test_rotation_period(self):
        self.assertEqual(rotation_period(("corn", "soybeans", "corn", "soybeans", "corn")), 2)
        self.assertEqual(rotation_period(("corn",) * 5), 1)
        self.assertEqual(rotation_period(("soybeans", "soybeans", "corn", "corn", "soybeans")), 4)

    def test_past_seasons_are_replayed_in_the_target_years_climate(self):
        as_it_was = weather(trend=0.05)
        moved = weather(trend=0.05, target_year=2026)
        self.assertEqual(as_it_was.trend_c_per_year, 0.0)
        self.assertAlmostEqual(moved.trend_c_per_year, 0.05, places=3)
        first = moved.first[2014]
        self.assertAlmostEqual(moved.tmax[first] - as_it_was.tmax[first], 0.05 * 12, places=2)
        last = moved.first[2026]
        self.assertAlmostEqual(moved.tmax[last], as_it_was.tmax[last], places=6)
        self.assertEqual(moved.rain, as_it_was.rain)


class WeeklyPlannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.advisor = build_advisor()
        context = build_context(record(), cls.advisor, [FIXTURES], reference_aws_mm=180.0)
        cls.context = assume_recent_crops(context, cls.advisor.catalog, START)
        cls.model = RotationModel(cls.context, cls.advisor)
        cls.planner = WeeklyPlanner(cls.model, weather(), START, weeks=156)
        cls.balanced = cls.planner.solve(Preferences())

    def week(self, day: date) -> int:
        return (day - START).days // 7

    def test_the_finished_season_is_filled_from_the_rotation(self):
        self.assertEqual(self.context.history[-2:], ("corn", "soybeans"))
        gap = next(g for g in self.context.gaps if g["code"].startswith("recent_crops_assumed"))
        self.assertEqual(gap["crops"], {2026: "soybeans"})

    def test_a_mapped_crop_outside_the_catalog_is_reported_not_guessed(self):
        context = build_context(
            record((1, 5, 1, 5, 242)), self.advisor, [FIXTURES], reference_aws_mm=180.0
        )
        filled = assume_recent_crops(context, self.advisor.catalog, START)
        codes = {g["code"]: g for g in filled.gaps}
        self.assertEqual(codes["recent_crops_not_in_catalog"]["years"], [2025])
        self.assertEqual(list(codes["recent_crops_assumed_from_the_rotation"]["crops"]), [2026])
        self.assertEqual(len(filled.history), len(context.history) + 1)

    def test_a_warmer_season_matures_earlier(self):
        corn = replace(load_phenology("IA")["corn"], method="heat")
        day = date(2025, 5, 4)
        cool, warm = self.planner, WeeklyPlanner(self.model, weather(warmer=3.0), START)
        ripe_cool, share = cool.mature(corn, cool.weather.position(2025, day))
        ripe_warm, _ = warm.mature(corn, warm.weather.position(2025, day))
        self.assertEqual(share, 1.0)
        self.assertLess(ripe_warm, ripe_cool)

    def test_a_crop_planted_too_late_is_cut_by_frost_and_not_offered(self):
        corn = replace(load_phenology("IA")["corn"], method="heat")
        position = self.planner.weather.position(2025, date(2025, 7, 25))
        _, share = self.planner.mature(corn, position)
        self.assertLess(share, 1.0)
        self.assertIsNone(self.planner.cycle("corn", self.week(date(2027, 7, 25))))
        self.assertIsNotNone(self.planner.cycle("corn", self.week(date(2027, 5, 6))))

    def test_nothing_is_planted_in_winter(self):
        kinds = {move.kind for move, _ in self.planner.moves(self.planner.start_spot)}
        self.assertEqual(kinds, {"wait"})

    def test_plan_steps_fall_inside_the_planting_windows_and_the_plan(self):
        steps = [s for s in self.balanced.steps(alternatives=2) if "crop" in s]
        self.assertTrue(steps)
        end = START + timedelta(weeks=156)
        for step in steps:
            self.assertGreaterEqual(step["daysFromUsualPlanting"], -14)
            self.assertGreaterEqual(date.fromisoformat(step["plant"]), START)
            self.assertLessEqual(date.fromisoformat(step["harvest"]["likely"]), end)
            self.assertLessEqual(len(step["alternatives"]), 2)
            for other in step["alternatives"]:
                self.assertGreaterEqual(other["costsUsdPerAcre"], 0.0)

    def test_solved_value_is_the_score_of_the_plan(self):
        preferences = Preferences()
        score = preferences.score(self.balanced.expected())
        value = self.balanced.value[self.planner.start_spot]
        crops = len([s for s in self.balanced.steps() if "crop" in s])
        self.assertGreaterEqual(score, value - 1e-6)
        self.assertLessEqual(score - value, TIE_USD_PER_DAY * 14 * crops + 1e-6)

    def test_the_plan_is_no_worse_than_the_current_rotation(self):
        current = self.planner.current_rotation()
        self.assertIsNotNone(current)
        crops = [s["crop"] for s in current.steps() if "crop" in s]
        self.assertEqual(crops[:2], ["corn", "soybeans"])
        self.assertTrue(all(s["tillage"] == "conventional" for s in current.steps()))
        preferences = Preferences()
        self.assertGreaterEqual(
            preferences.score(self.balanced.expected()) + 1.0,
            preferences.score(current.expected()),
        )

    def test_each_strategy_wins_on_its_own_terms(self):
        cash, soil = Preferences(0.0, 0.0), Preferences(200.0, 20.0)
        cash_first, soil_first = self.planner.solve(cash), self.planner.solve(soil)
        self.assertGreaterEqual(
            cash.score(cash_first.expected()) + 1.0, cash.score(soil_first.expected())
        )
        self.assertGreaterEqual(
            soil.score(soil_first.expected()) + 1.0, soil.score(cash_first.expected())
        )

    def test_a_year_without_a_harvest_enters_the_history_as_fallow(self):
        spot = Spot(self.week(date(2028, 5, 4)), self.context.history, harvested=2026)
        planted = [(m, o) for m, o in self.planner.moves(spot) if m.kind == "plant"]
        self.assertTrue(planted)
        for move, outcomes in planted:
            self.assertEqual(move.skipped, 1)
            for _, after, _ in outcomes:
                self.assertEqual(after.history[-2:], (FALLOW, move.action.crop))
                self.assertEqual(after.harvested, 2028)
        on_time = replace(spot, harvested=2027)
        self.assertTrue(all(m.skipped == 0 for m, _ in self.planner.moves(on_time)))

    def test_history_crops_outside_the_plan_get_their_class_of_ground_cover(self):
        self.assertEqual(self.planner._crop_factor("corn"), 0.40)
        self.assertEqual(self.planner._crop_factor("grass_pasture"), 0.02)
        self.assertEqual(self.planner._crop_factor("non_crop"), 0.40)

    def test_soil_loss_needs_erodibility(self):
        context = build_context(field(), self.advisor, [FIXTURES], reference_aws_mm=180.0)
        planner = WeeklyPlanner(RotationModel(context, self.advisor), weather(), START, weeks=60)
        self.assertIsNone(planner.erosivity)
        self.assertIn(
            "soil_loss_unknown_no_erodibility_or_slope", {g["code"] for g in planner.gaps}
        )
        card = score_card(planner.solve(), Preferences())
        self.assertIsNone(card["soilLossTPerHaYear"])

    def test_organic_soil_gets_no_carbon_score(self):
        context = build_context(
            record(om_pct=75.0), self.advisor, [FIXTURES], reference_aws_mm=180.0
        )
        planner = WeeklyPlanner(RotationModel(context, self.advisor), weather(), START, weeks=60)
        self.assertFalse(planner.carbon_known)
        self.assertIn("soil_carbon_not_scored_organic_soil", {g["code"] for g in planner.gaps})
        card = score_card(planner.solve(), Preferences())
        self.assertIsNone(card["soilCarbonChangeTPerHaYear"])

    def test_report_compares_the_strategies_with_the_current_rotation(self):
        report = json.loads(json.dumps(weekly_plan(self.planner)))
        names = [s["strategy"] for s in report["strategies"]]
        self.assertEqual(names, ["current_rotation", "balanced", "cash_first", "soil_first"])
        self.assertEqual(report["historySource"], "cdl")
        scores = {s["strategy"]: s["perYear"]["scoreUsdPerAcreYear"] for s in report["strategies"]}
        self.assertGreaterEqual(scores["balanced"] + 0.5, max(scores.values()))
        for strategy in report["strategies"]:
            self.assertIn(strategy["perYear"]["soilLossClass"], {
                "very low (tolerable)", "low", "moderate", "high", "severe"
            })  # fmt: skip
        self.assertIn("history_is_satellite_estimate", {g["code"] for g in report["dataGaps"]})


if __name__ == "__main__":
    unittest.main()
