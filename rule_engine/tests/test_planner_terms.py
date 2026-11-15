"""The reward parts stored in the tables, alfalfa's hay counties and its seeding-year yield."""

import unittest

import numpy as np

from rule_engine import build_advisor
from rule_engine.planner import RotationModel, build_context, tabular
from rule_engine.planner.tables import CostTable, processor_counties
from rule_engine.tests.test_planner import FIXTURES, field, several_years


class StoredTermsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        advisor = build_advisor()
        context = several_years(build_context(field(), advisor, [FIXTURES], reference_aws_mm=180.0))
        model = RotationModel(context, advisor, crops=("corn", "soybeans", "alfalfa"), horizon=3)
        cls.table = tabular.tabulate(model)

    def test_the_parts_add_up_to_the_stored_reward(self):
        table = self.table
        fixed, weather = table.reweighted(table.risk_usd_per_point)
        np.testing.assert_allclose(fixed[table.mask], table.fixed[table.mask], atol=1e-2)
        np.testing.assert_allclose(weather, table.weather, atol=1e-2)

    def test_a_new_risk_weight_needs_no_rebuild(self):
        table = self.table
        fixed, _ = table.reweighted(0.0)
        cheaper = fixed - table.fixed
        expected = table.risk_usd_per_point * table.terms["points"]
        np.testing.assert_allclose(cheaper[table.mask], expected[table.mask], atol=1e-2)
        self.assertGreater(table.terms["cost"][table.mask].min(), 0.0)


class AlfalfaTests(unittest.TestCase):
    def test_alfalfa_is_planned_only_where_hay_is_grown(self):
        counties = processor_counties()["alfalfa"]
        self.assertIn("04013", counties)  # Maricopa, AZ
        self.assertNotIn("19169", counties)  # Story, IA: corn and soybeans
        advisor = build_advisor()
        record = field()
        record["countyFips"] = "19169"
        context = build_context(record, advisor, [FIXTURES], reference_aws_mm=180.0)
        model = RotationModel(context, advisor, crops=("corn", "soybeans", "alfalfa"), horizon=2)
        self.assertNotIn("alfalfa", model.crops)
        self.assertIn("no_hay_market_nearby", {g["code"] for g in model.gaps})

    def test_the_seeding_year_yield_follows_the_fields_own_budget(self):
        # southern Arizona: fall-seeded, 8.5 tons in the establishment year as in a full year
        self.assertAlmostEqual(
            CostTable(region="Fruitful Rim", state="AZ").seeding_year_yield("alfalfa"), 1.0
        )
        self.assertAlmostEqual(
            CostTable(region="Heartland", state="IA").seeding_year_yield("alfalfa"), 0.625
        )
        # an establishment budget without a harvest: the crop_adjustments.csv factor applies
        self.assertIsNone(
            CostTable(region="Prairie Gateway", state="KS").seeding_year_yield("alfalfa")
        )
        self.assertIsNone(CostTable(region="Heartland").seeding_year_yield("corn"))


if __name__ == "__main__":
    unittest.main()
