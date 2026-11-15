"""Irrigation, year-specific costs, soil loss, crop units and the extra soil inputs."""

import unittest
from unittest import mock

import numpy as np
import pandas as pd

from rule_engine import build_advisor
from rule_engine.planner import Action, RotationModel, Weights, build_context
from rule_engine.planner.adapter import RuleAdapter
from rule_engine.planner.dynamics import SoilCarbon
from rule_engine.planner.erosion import YearlySoilLoss
from rule_engine.planner.irrigation import field_status, practice_ratios
from rule_engine.planner.model import annual_rain_mm
from rule_engine.planner.tables import (
    CROPS,
    DRILLED,
    CostTable,
    _rows,
    byproduct_share,
    crop_region,
    load_carbon_inputs,
    processor_counties,
    t_ha_per,
    unit_kind,
)
from rule_engine.tests.test_planner import FIXTURES, field, several_years

SOIL = {"kw": 0.32, "slope_pct": 4.0, "slope_length_m": 60.0}


def irrigated_field(status="irrigated"):
    record = field()
    record["soil"].update(SOIL, bulk_density_g_cm3=1.45, nccpi_all=0.8)
    record["irrigation"] = {"status": status, "share": 1.0, "source": "LANID-US"}
    return record


class UnitTests(unittest.TestCase):
    def test_unit_kind(self):
        for text, kind in [
            ("bu/acre", "bu"),
            ("usd/lb", "lb"),
            ("$ / CWT", "cwt"),
            ("tons", "ton"),
        ]:
            self.assertEqual(unit_kind(text), kind)

    def test_mass_units_to_t_ha(self):
        crop = build_advisor().catalog.crops["corn"]
        self.assertAlmostEqual(t_ha_per(crop, "lb") * 1000, 1.12085, places=4)  # 1000 lb/acre
        self.assertAlmostEqual(t_ha_per(crop, "cwt"), 100 * t_ha_per(crop, "lb"))
        self.assertEqual(t_ha_per(crop, "bu"), crop.bu_to_t_ha)


class IrrigationTests(unittest.TestCase):
    def test_status_from_recent_years(self):
        frame = pd.DataFrame(
            {
                "field_id": ["a"] * 6 + ["b"] * 3,
                "year": [2015, 2016, 2017, 2018, 2019, 2020, 2018, 2019, 2020],
                "irrigated": [1, 1, 0, 0, 0, 0, 1, 1, 0],
                "source": ["LANID-US"] * 9,
            }
        )
        status = field_status(frame)
        self.assertEqual(status["a"]["status"], "dryland")  # only one of the last five
        self.assertEqual(status["b"]["status"], "irrigated")
        self.assertEqual(status["a"]["years"], [2016, 2020])

    def test_nebraska_corn_split(self):
        irrigated, mean_irrigated = practice_ratios("corn", "NE", "irrigated")
        _, mean_dryland = practice_ratios("corn", "NE", "dryland")
        self.assertGreater(mean_irrigated, 1.0)
        self.assertLess(mean_dryland, 1.0)
        self.assertGreater(len(irrigated), 20)
        self.assertIsNone(practice_ratios("corn", "NE", None))


class CostIndexTests(unittest.TestCase):
    def test_year_index_has_mean_one(self):
        index = CostTable(region="Heartland", state="IA").year_index("corn")
        self.assertGreater(len(index), 30)
        self.assertAlmostEqual(sum(index.values()) / len(index), 1.0, places=6)
        self.assertEqual(CostTable(region="Heartland", state="IA").year_index("alfalfa"), {})

    def test_extension_budgets_of_the_new_crops(self):
        table = CostTable(region="Northern Great Plains", state="ND")
        elsewhere = CostTable(region="Heartland", state="IA")
        for crop in ("dry_peas", "lentils", "chickpeas", "flax", "millet"):
            self.assertIn(crop, CROPS)
            self.assertIn(crop, DRILLED)
            self.assertGreater(table.regional[crop].usd_per_acre, 150)
            self.assertFalse(elsewhere.regional[crop].verified)

    def test_processor_counties(self):
        processors = processor_counties()
        self.assertGreater(len(processors["sugarbeets"]), 50)
        self.assertGreater(len(processors["potatoes"]), 100)
        self.assertTrue(all(len(c) == 5 for c in processors["potatoes"]))

    def test_cottonseed_share(self):
        product, share = byproduct_share("cotton", "Prairie Gateway")
        self.assertEqual(product, "cottonseed")
        self.assertGreater(share, 0.1)
        self.assertLess(share, 0.4)
        self.assertEqual(byproduct_share("cotton", None), byproduct_share("cotton", "U.S. total"))
        self.assertIsNone(byproduct_share("corn", "Heartland"))

    def test_irrigation_cost(self):
        table = CostTable(region="Heartland", state="NE")
        full = table.irrigation_full_cost().usd_per_acre
        energy = next(
            float(r["energy"]) for r in _rows("irrigation_costs.csv") if r["state"] == "NE"
        )
        self.assertGreater(full, energy)  # more than pumping energy
        share = table.irrigation_share("corn")  # ERS Heartland corn: partly irrigated
        self.assertGreater(share, 0.0)
        self.assertLess(share, 0.5)
        self.assertAlmostEqual(table.irrigation_cost("corn").usd_per_acre, (1 - share) * full)
        self.assertAlmostEqual(table.irrigation_cost("corn", "dryland").usd_per_acre, -share * full)
        self.assertEqual(table.irrigation_cost("corn", None).usd_per_acre, 0.0)
        # an irrigated potato budget: nothing to add, the whole cost to take off a dryland field
        self.assertEqual(table.irrigation_cost("potatoes").usd_per_acre, 0.0)
        self.assertAlmostEqual(table.irrigation_cost("potatoes", "dryland").usd_per_acre, -full)
        # the Red River sugarbeet budget is dryland
        red_river = CostTable(region="Northern Great Plains", state="MN")
        self.assertEqual(red_river.irrigation_share("sugarbeets"), 0.0)
        self.assertEqual(red_river.irrigation_cost("sugarbeets", "dryland").usd_per_acre, 0.0)
        self.assertEqual(red_river.regional["sugarbeets"].usd_per_acre, 1673.36)


class CostRegionTests(unittest.TestCase):
    def test_rice_region_of_county_and_state(self):
        self.assertEqual(
            crop_region("rice", "05001", "Mississippi Portal", "AR"), ("Arkansas Non-Delta", True)
        )  # Grand Prairie
        self.assertEqual(crop_region("rice", None, "Prairie Gateway", "TX"), ("Gulf Coast", True))
        self.assertEqual(crop_region("rice", None, "Fruitful Rim", "CA"), ("California", True))
        self.assertFalse(crop_region("rice", "05093", "Mississippi Portal", "AR")[1])

    def test_peanut_seaboard_split(self):
        self.assertEqual(
            crop_region("peanuts", None, "Southern Seaboard", "NC")[0],
            "Southern Seaboard (VA, NC, SC)",
        )
        self.assertEqual(
            crop_region("peanuts", None, "Southern Seaboard", "MS"),
            ("Southern Seaboard (AL, GA)", False),
        )
        self.assertEqual(crop_region("corn", None, "Heartland", "IA"), ("Heartland", True))

    def test_state_budget_wins(self):
        table = CostTable(region="Northern Great Plains", state="MN")
        self.assertEqual(table.regional["sugarbeets"].usd_per_acre, 1673.36)
        self.assertTrue(table.regional["sugarbeets"].verified)

    def test_lapsed_region_scales_the_national_cost(self):
        texas = CostTable(region="Prairie Gateway", state="TX", county="48165")
        national = CostTable(region="Heartland", state="IA").regional["peanuts"]
        peanuts = texas.regional["peanuts"]
        self.assertFalse(peanuts.verified)
        self.assertNotAlmostEqual(peanuts.usd_per_acre, national.usd_per_acre, places=0)

    def test_every_crop_has_a_carbon_input(self):
        table = load_carbon_inputs()
        for crop in (
            "rice",
            "peanuts",
            "potatoes",
            "sugarbeets",
            "dry_peas",
            "lentils",
            "chickpeas",
            "millet",
            "cotton",
        ):
            self.assertIn(crop, table)
        self.assertIn("small_grain", table)  # flax, rye, canola, triticale


class MeasuredRuleTests(unittest.TestCase):
    def test_points_measured_by_a_fired_yield_factor_are_dropped(self):
        advisor = build_advisor()
        context = build_context(field(), advisor, [FIXTURES], 180.0)
        corn = ("corn",) * 5

        def points(measured):
            with mock.patch.dict("rule_engine.planner.adapter.MEASURED_BY", measured, clear=True):
                part = RuleAdapter(advisor, context).history_part(corn, "corn", "no_till", "none")
            return {rule for rule, _ in part.point_rules}, part

        kept, part = points({})
        self.assertIn("corn_rootworm_continuous", kept)
        self.assertIn("continuous_corn_yield_penalty", {r for r, *_ in part.yield_rules})
        dropped, same = points({"corn_rootworm_continuous": ("continuous_corn_yield_penalty",)})
        self.assertEqual(dropped, kept - {"corn_rootworm_continuous"})
        self.assertEqual(same.factor, part.factor)  # the yield factor itself is kept
        unfired, _ = points({"corn_rootworm_continuous": ("soy_after_soy_yield_penalty",)})
        self.assertEqual(unfired, kept)


class SoilLossTests(unittest.TestCase):
    def test_tillage_and_cover_reduce_loss(self):
        loss = YearlySoilLoss(SOIL, 900.0)
        conventional = loss.t_per_ha("corn", "conventional", "none", False)
        self.assertGreater(conventional, loss.t_per_ha("corn", "no_till", "none", False))
        self.assertGreater(conventional, loss.t_per_ha("corn", "conventional", "rye", False))
        self.assertGreater(conventional, loss.t_per_ha("alfalfa", "conventional", "none", True))

    def test_unknown_soil_has_no_loss(self):
        loss = YearlySoilLoss({"slope_pct": 2.0}, 900.0)
        self.assertEqual(loss.t_per_ha("corn", "conventional", "none", False), 0.0)
        self.assertIn("soil_loss_unknown", {g["code"] for g in loss.gaps})

    def test_long_slopes_are_capped(self):
        capped = YearlySoilLoss({"kw": 0.3, "slope_pct": 4.0, "slope_length_m": 1000.0}, 900.0)
        limit = YearlySoilLoss({"kw": 0.3, "slope_pct": 4.0, "slope_length_m": 305.0}, 900.0)
        self.assertAlmostEqual(capped.unit, limit.unit)
        self.assertIn("slope_length_capped", {g["code"] for g in capped.gaps})

    def test_slope_length_default_is_reported(self):
        loss = YearlySoilLoss({"kw": 0.3, "slope_pct": 2.0}, 900.0)
        self.assertIn("slope_length_assumed", {g["code"] for g in loss.gaps})

    def test_bulk_density_scales_the_carbon_stock(self):
        carbon = SoilCarbon()
        _, light = carbon.initial({"om_pct": 4.0})
        _, dense = carbon.initial({"om_pct": 4.0, "bulk_density_g_cm3": 1.43})
        self.assertAlmostEqual(dense + carbon.initial_young, (light + carbon.initial_young) * 1.1)


class IrrigatedModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from rule_engine.planner import tabular

        cls.tabular = tabular
        cls.advisor = build_advisor()
        context = build_context(irrigated_field(), cls.advisor, [FIXTURES], 180.0)
        cls.model = RotationModel(
            several_years(context), cls.advisor, crops=("corn", "soybeans", "oats"), horizon=3
        )
        cls.table = tabular.tabulate(cls.model)

    def test_rain_from_the_seasons(self):
        rain = annual_rain_mm(self.model.context.seasons)
        self.assertGreater(rain, 400)
        self.assertLess(rain, 2000)

    def test_irrigated_field_pays_energy_and_has_no_drought_loss(self):
        model = self.model
        self.assertTrue(model.irrigated)
        self.assertTrue(all(y.crops["corn"].drought_loss == 0.0 for y in model.years))
        dry_context = build_context(irrigated_field("dryland"), self.advisor, [FIXTURES], 180.0)
        dry = RotationModel(
            several_years(dry_context), self.advisor, crops=("corn", "soybeans"), horizon=1
        )
        action = Action("corn", "conventional", "none")
        energy = model.costs.irrigation_full_cost().usd_per_acre  # added part + removed part
        wet_cost = model._base_outcomes(model.initial_state.history, action)[0].cost
        dry_cost = dry._base_outcomes(dry.initial_state.history, action)[0].cost
        self.assertAlmostEqual(wet_cost - dry_cost, energy, places=6)

    def test_soil_loss_is_charged(self):
        model = self.model
        tilled, untilled = (Action("corn", t, "none") for t in ("conventional", "no_till"))
        self.assertGreater(model.soil_loss_t_ha(tilled), model.soil_loss_t_ha(untilled))
        outcome = model._base_outcomes(model.initial_state.history, tilled)[0]
        expected = Weights().erosion_usd_per_t * model.soil_loss_t_ha(tilled) * 0.404686
        self.assertAlmostEqual(outcome.erosion, expected, places=6)

    def test_cost_moves_with_the_year(self):
        action = Action("corn", "conventional", "none")
        costs = {
            o.cost for o in self.model._base_outcomes(self.model.initial_state.history, action)
        }
        self.assertGreater(len(costs), 1)

    def test_factored_reward_is_the_model_reward(self):
        table, model = self.table, self.model
        state = model.open_loop_state
        for a in np.flatnonzero(table.mask[0]):
            action = self.tabular.ACTIONS[table.global_actions[a]]
            for y in range(len(model.years)):
                self.assertAlmostEqual(
                    float(table.reward[0, a, y]), model.outcome(state, action, y).reward, delta=0.01
                )

    def test_statics_hold_the_new_inputs(self):
        names = self.tabular.STATIC_NAMES
        statics = self.table.statics
        for name in ("nccpi", "kw", "slope_length_m", "bulk_density", "irrigated_share"):
            self.assertEqual(statics[2 * names.index(name) + 1], 1.0, name)
        self.assertEqual(statics[2 * names.index("ndvi_peak_mean") + 1], 0.0)


if __name__ == "__main__":
    unittest.main()
