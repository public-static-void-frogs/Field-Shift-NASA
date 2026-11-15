import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

import numpy as np

from rule_engine import build_advisor
from rule_engine.facts import HistoryYear
from rule_engine.planner import (
    Action,
    Persistence,
    RotationEnv,
    RotationModel,
    SoilCarbon,
    Weights,
    build_context,
    evaluate,
    exact_plan,
    fixed_rotation,
    myopic,
    open_loop_plan,
    q_learning,
)
from rule_engine.planner.adapter import RuleAdapter
from rule_engine.planner.chance import YearChain, build_chain
from rule_engine.planner.sampler import YearSampler, modelled_loss
from rule_engine.planner.tables import TILLAGE, CostTable, load_responses, processor_counties

FIXTURES = Path(__file__).parent / "fixtures" / "season_summary"
CSBID = "191825000014246"
FIXTURE_COUNTY = "19015"
# the fixture county grows little hay (0.25 % of the sampled acres, under the 1 % of
# hay_counties.csv): the tests plan alfalfa there anyway, so list it as a hay county
_counties = processor_counties()
_counties["alfalfa"] = _counties["alfalfa"] | {FIXTURE_COUNTY}


def field(history=(1, 5, 1, 5, 1), soil=True):
    record = {
        "id": "planner-test",
        "area": 40.0,
        "sourceId": CSBID,
        "stateFips": "19",
        "countyFips": "19015",
        "sourceYear": 2025,
        "sourceProperties": {f"CDL{2021 + i}": code for i, code in enumerate(history)},
    }
    if soil:
        record["soil"] = {
            "om_pct": 4.0,
            "aws_100cm_mm": 150.0,
            "slope_pct": 2.0,
            "drainage_class": "Well drained",
        }
    return record


class PlannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.advisor = build_advisor()
        cls.context = build_context(field(), cls.advisor, [FIXTURES], reference_aws_mm=180.0)
        cls.model = RotationModel(cls.context, cls.advisor, horizon=4)

    def test_context_reads_history_and_seasons(self):
        self.assertEqual(self.context.history, ("corn", "soybeans", "corn", "soybeans", "corn"))
        self.assertEqual(self.context.history_source, "cdl")
        self.assertEqual(sorted(self.context.seasons), [2025])
        codes = {gap["code"] for gap in self.model.gaps}
        self.assertIn("history_is_satellite_estimate", codes)

    def test_history_part_matches_engine_assessment(self):
        """The adapter's lean rule pass must find what the engine's own assessment finds."""
        adapter = RuleAdapter(self.advisor, self.context)
        for history, crop, tillage, cover in [
            (("corn",) * 5, "corn", "conventional", "none"),
            (("corn", "soybeans", "corn", "soybeans", "corn"), "soybeans", "no_till", "rye"),
            (("soybeans", "oats", "corn", "soybeans", "corn"), "oats", "strip_till", "none"),
            (("corn", "alfalfa", "alfalfa", "alfalfa", "alfalfa"), "corn", "no_till", "none"),
        ]:
            part = adapter.history_part(history, crop, tillage, cover)
            years = [HistoryYear(i, c, None, "declared") for i, c in enumerate(history)]
            assessed = self.advisor._assess(
                self.advisor.catalog.crops[crop],
                adapter.field_with(tillage, cover),
                years,
                [],
                16.0,
                [],
                "imperial",
                "IA",
            )
            findings = assessed["risks"] + assessed["benefits"] + assessed["advisories"]
            expected_yield = {f["ruleId"] for f in findings if f["yieldFactor"]}
            expected_points = {
                f["ruleId"]: f["points"] for f in findings if f["points"] and not f["yieldFactor"]
            }
            self.assertEqual({r[0] for r in part.yield_rules}, expected_yield, history)
            self.assertEqual(dict(part.point_rules), expected_points, history)

    def test_continuous_corn_costs_more_and_yields_less(self):
        adapter = self.model.adapter
        rotated = adapter.history_part(("soybeans",), "corn", "conventional", "none")
        continuous = adapter.history_part(("corn",), "corn", "conventional", "none")
        self.assertLess(continuous.factor, rotated.factor)
        costs = CostTable()
        self.assertGreater(
            costs.crop_cost("corn", "corn", "conventional").usd_per_acre,
            costs.crop_cost("corn", "soybeans", "conventional").usd_per_acre,
        )
        derived = costs.crop_cost("corn", "corn", "strip_till")
        self.assertFalse(derived.verified)
        self.assertAlmostEqual(derived.usd_per_acre, 686.02 + 633.97 - 637.98, places=2)

    def test_alfalfa_seeding_year(self):
        costs = CostTable()
        self.assertLess(
            costs.crop_cost("alfalfa", "corn", "no_till").usd_per_acre,
            costs.crop_cost("alfalfa", "alfalfa", "no_till").usd_per_acre,
        )
        state = self.model.initial_state
        seeding = Action("alfalfa", "no_till", "none")
        after = self.model.transition(state, seeding)
        first = self.model.summary(state, seeding)["yieldPerAcre"]
        second = self.model.summary(after, seeding)["yieldPerAcre"]
        self.assertAlmostEqual(first / second, 0.625, places=2)

    def test_action_mask(self):
        state = self.model.initial_state
        labels = {a.label() for a in self.model.actions(state)}
        self.assertIn("corn/no_till/rye", labels)
        self.assertNotIn("oats/conventional/rye", labels)  # cool-season crop
        stand = self.model.transition(state, Action("alfalfa", "no_till", "none"))
        labels = {a.label() for a in self.model.actions(stand)}
        self.assertNotIn("corn/no_till/rye", labels)  # no rye into a standing perennial
        self.assertEqual({a for a in labels if a.startswith("alfalfa")}, {"alfalfa/no_till/none"})

    def test_modelled_loss_uses_response_table(self):
        adapter = self.model.adapter
        season = self.context.seasons[2025]
        weather = adapter.weather_part("corn", season)
        factor, drought, paid = modelled_loss("corn", weather, load_responses())
        self.assertGreater(factor, 0.0)
        self.assertLessEqual(factor, 1.0)
        if weather.drought_weeks is not None:
            self.assertIn("drought_monitor_critical_stage", paid)
            self.assertAlmostEqual(
                drought,
                min(0.6, weather.drought_weeks * 0.0065 + weather.d4_weeks * 0.08),
                places=6,
            )

    def test_soil_carbon_step(self):
        carbon = SoilCarbon()
        young, old = carbon.initial({"om_pct": 4.0})
        self.assertAlmostEqual(young + old, 4.0 * 22.62, places=1)
        _, bare = carbon.step(young, old, 0.0)
        _, fed = carbon.step(young, old, 1.0)
        self.assertLess(bare, fed)
        self.assertEqual(carbon.initial({}), (None, None))
        no_soil = build_context(field(soil=False), self.advisor, [FIXTURES])
        model = RotationModel(no_soil, self.advisor, horizon=2)
        self.assertIn("soil_organic_matter_unknown", {g["code"] for g in model.gaps})
        self.assertEqual(exact_plan(model).steps[0]["soilValueUsdPerAcre"], 0.0)

    def test_env_episode(self):
        env = RotationEnv(self.model, seed=1)
        observation, info = env.reset()
        self.assertEqual(observation["year"], 0)
        total, done, steps = 0.0, False, 0
        while not done:
            observation, reward, done, truncated, info = env.step(info["validActions"][0])
            total += reward
            steps += 1
        self.assertEqual(steps, self.model.horizon)
        self.assertEqual(info["validActions"], [])
        with self.assertRaises(ValueError):
            env.step(0)
        env.reset()
        rye_before_oats = env.actions.index(Action("oats", "conventional", "rye"))
        with self.assertRaises(ValueError):
            env.step(rye_before_oats)

    def test_exact_plan_is_at_least_as_good_as_baselines(self):
        best = exact_plan(self.model)
        self.assertEqual(len(best.actions), self.model.horizon)
        for other in (
            myopic(self.model),
            fixed_rotation(self.model, ("corn",), "conventional", "none"),
            fixed_rotation(self.model, ("corn", "soybeans"), "conventional", "none"),
            fixed_rotation(self.model, ("corn", "soybeans"), "no_till", "rye"),
        ):
            self.assertGreaterEqual(best.value + 1e-6, other.value, other.method)

    def test_q_learning_approaches_exact_plan(self):
        model = RotationModel(
            self.context,
            self.advisor,
            crops=("corn", "soybeans", "oats"),
            horizon=3,
            tillage=("conventional", "no_till"),
        )
        best = exact_plan(model)
        learned, table = q_learning(model, episodes=6000, seed=3)
        self.assertTrue(table)
        self.assertLessEqual(learned.value, best.value + 1e-6)
        self.assertGreater(learned.value, best.value - 0.05 * abs(best.value))

    def test_weights_change_the_plan_value(self):
        plain = RotationModel(
            self.context, self.advisor, horizon=3, weights=Weights(risk_usd_per_point=0.0)
        )
        cautious = RotationModel(
            self.context, self.advisor, horizon=3, weights=Weights(risk_usd_per_point=60.0)
        )
        action = Action("corn", "conventional", "none")
        state = plain.initial_state
        self.assertGreater(plain.expected(state, action), cautious.expected(state, action))


def several_years(context):
    """The fixture season repeated as 2019-2025, alternating a drought-free and a drought year."""
    season = context.seasons[2025]
    weeks = len(season.weekly["dm_max"])
    seasons = {}
    for year in range(2019, 2026):
        level = 3.0 if year % 2 else -1.0
        weekly = {**season.weekly, "dm_max": [level] * weeks}
        seasons[year] = replace(season, year=year, weekly=weekly)
    return replace(context, seasons=seasons)


class CarryOverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.advisor = build_advisor()
        base = build_context(field(), cls.advisor, [FIXTURES], reference_aws_mm=180.0)
        cls.context = several_years(base)
        cls.crops = ("corn", "soybeans", "oats")

    def model(self, **options):
        return RotationModel(self.context, self.advisor, crops=self.crops, horizon=3, **options)

    def test_chain_prefers_years_that_start_like_this_one_ended(self):
        start = {1: {"drought": 0.0, "price": None}, 2: {"drought": 3.0, "price": None}}
        end = {1: {"drought": 3.0, "price": None}, 2: {"drought": 0.0, "price": None}}
        chain = YearChain([1, 2], start, end, Persistence(strength=0.8))
        self.assertEqual(chain.signals, ("drought",))
        for row in chain.matrix:
            self.assertAlmostEqual(sum(row), 1.0)
        self.assertGreater(chain.matrix[0][1], chain.matrix[0][0])  # year 1 ended dry
        self.assertGreater(chain.matrix[1][0], chain.matrix[1][1])
        self.assertGreaterEqual(min(chain.matrix[0]), 0.1)  # the uniform share remains
        self.assertAlmostEqual(sum(chain.marginal(3)), 1.0)

    def test_one_matching_year_does_not_take_all_the_odds(self):
        # 2025 ended in a drought class that only 2000 started from
        labels = list(range(1981, 2026))
        start = {y: {"drought": 0.0, "price": 1.0} for y in labels}
        end = {y: {"drought": 0.0, "price": 1.0} for y in labels}
        start[2000]["drought"], end[2025]["drought"] = 3.0, 3.0
        chain = YearChain(labels, start, end, Persistence())
        first = chain.matrix[chain.latest]
        self.assertEqual(max(range(len(first)), key=first.__getitem__), labels.index(2000))
        self.assertLess(first[labels.index(2000)], 0.5)
        for row in chain.matrix:
            self.assertGreaterEqual(1.0 / sum(p * p for p in row), 45**0.5 - 1e-9)

    def test_no_chain_without_strength_or_years(self):
        model = self.model(persistence=Persistence(strength=0.0))
        self.assertIsNone(model.chain)
        self.assertIsNone(model.initial_state.prev)
        self.assertIsNone(build_chain(model.years[:3], {}, model.sampler.basis, Persistence()))
        self.assertAlmostEqual(exact_plan(model).value, open_loop_plan(model).value)

    def test_state_tracks_the_year_just_experienced(self):
        model = self.model()
        self.assertEqual(model.initial_state.prev, len(model.years) - 1)
        self.assertIn("year_odds_from_few_analog_years", {g["code"] for g in model.gaps})
        action = model.actions(model.initial_state)[0]
        with self.assertRaises(ValueError):
            model.transition(model.initial_state, action)
        self.assertEqual(model.transition(model.initial_state, action, 2).prev, 2)
        self.assertIsNone(model.transition(model.open_loop_state, action).prev)
        env = RotationEnv(model, seed=4)
        observation, info = env.reset()
        self.assertEqual(observation["lastYear"]["year"], 2025)
        observation, *_ = env.step(info["validActions"][0])
        self.assertIn(observation["lastYear"]["year"], range(2019, 2026))

    def test_reacting_is_never_worse_than_a_fixed_sequence(self):
        model = self.model()
        best, fixed = exact_plan(model), open_loop_plan(model)
        self.assertFalse(fixed.adaptive)
        self.assertGreaterEqual(best.value + 1e-6, fixed.value)
        self.assertGreaterEqual(best.value + 1e-6, myopic(model).value)
        learned, _ = q_learning(model, episodes=3000, seed=2)
        self.assertLessEqual(learned.value, best.value + 1e-6)

    def test_fixed_sequence_value_matches_its_own_forecast(self):
        """The open-loop solver's forecast uses step odds seen from the start of the plan."""
        model = self.model()
        fixed = open_loop_plan(model)
        state, total = model.open_loop_state, 0.0
        for action in fixed.actions:
            total += model.expected(state, action)
            state = model.transition(state, action)
        self.assertAlmostEqual(total, fixed.value, places=6)


class ZeroYieldTests(unittest.TestCase):
    def test_a_zero_county_yield_is_not_an_observation(self):
        advisor = build_advisor()
        base = several_years(build_context(field(), advisor, [FIXTURES], reference_aws_mm=180.0))
        zeroed = {
            year: replace(s, scalars={**s.scalars, "yield_corn_bu_ac": 0.0})
            for year, s in base.seasons.items()
        }
        model = RotationModel(
            replace(base, seasons=zeroed), advisor, crops=("corn", "soybeans"), horizon=1
        )
        basis = model.sampler.basis["corn"]
        self.assertGreater(basis.expected_yield, 0)
        self.assertNotEqual(basis.yield_level, "county")

    def test_a_yield_series_that_ended_long_ago_is_not_the_yield_level(self):
        advisor = build_advisor()
        context = build_context(field(), advisor, [FIXTURES], reference_aws_mm=180.0)
        # NASS published Iowa sorghum yields for 1980-1984 only: their trend read at 1985 is not
        # today's yield, so the crop is left out instead of forecast at that level
        crops = ("corn", "soybeans", "sorghum")
        model = RotationModel(context, advisor, crops=crops, horizon=2)
        self.assertNotIn("sorghum", model.crops)
        self.assertIn({"code": "no_yield", "crop": "sorghum"}, model.gaps)
        # planned as of 1986 the same series is current
        then = replace(context, trend_year=1986)
        sampler = YearSampler(then, advisor, model.adapter, ["sorghum"])
        self.assertEqual(sampler.basis["sorghum"].yield_level, "state")

    def county_corn(self, yields):
        """The corn basis of a field whose county published `yields` ({year: bu/acre})."""
        advisor = build_advisor()
        base = build_context(field(), advisor, [FIXTURES], reference_aws_mm=180.0)
        season = base.seasons[2025]
        seasons = {
            year: replace(
                season,
                year=year,
                scalars={**season.scalars, "yield_corn_bu_ac": yields.get(year, 0.0)},
            )
            for year in range(1981, 2026)
        }
        model = RotationModel(
            replace(base, seasons=seasons), advisor, crops=("corn", "soybeans"), horizon=1
        )
        return model, model.sampler.basis["corn"]

    def test_a_county_series_that_ended_is_not_the_yield_level(self):
        # county yields published for 1981-1993 only, at a third of today's level
        model, basis = self.county_corn({year: 60.0 for year in range(1981, 1994)})
        self.assertNotEqual(basis.yield_level, "county")
        self.assertGreater(basis.expected_yield, 120)
        self.assertIn("yield_history_ended", basis.notes)
        self.assertIn({"code": "yield_history_ended", "crop": "corn"}, model.gaps)
        # two recent years do not make a level either
        _, basis = self.county_corn({2024: 60.0, 2025: 60.0})
        self.assertNotEqual(basis.yield_level, "county")

    def test_a_short_county_series_gives_its_recent_mean_not_a_trend(self):
        # five falling years: their trend read at 2026 would be 140
        falling = {2021: 190.0, 2022: 180.0, 2023: 170.0, 2024: 160.0, 2025: 150.0}
        _, basis = self.county_corn(falling)
        self.assertEqual(basis.yield_level, "county")
        self.assertAlmostEqual(basis.expected_yield, 170.0, places=6)
        # old years are not read as bad years against the recent level
        _, basis = self.county_corn(falling | {1981: 60.0, 1982: 60.0})
        self.assertAlmostEqual(basis.expected_yield, 170.0, places=6)
        self.assertEqual(basis.observed_years, 5)


class TabularTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from rule_engine.planner import tabular

        cls.tabular = tabular
        cls.advisor = build_advisor()
        base = build_context(field(), cls.advisor, [FIXTURES], reference_aws_mm=180.0)
        cls.model = RotationModel(
            several_years(base), cls.advisor, crops=("corn", "soybeans", "oats"), horizon=3
        )
        cls.table = tabular.tabulate(cls.model)

    def test_table_agrees_with_the_model(self):
        best, _ = self.tabular.score(self.table)
        short, _ = self.tabular.score(self.table, self.tabular.myopic_choice)
        self.assertAlmostEqual(best, exact_plan(self.model).value, delta=1.0)
        self.assertAlmostEqual(short, myopic(self.model).value, delta=1.0)
        self.assertGreaterEqual(best, short)

    def test_table_shape(self):
        table = self.table
        self.assertEqual(table.node_t[0], 0)
        self.assertEqual(table.reward.shape[1:], (self.tabular.LOCAL, self.tabular.MAX_YEARS))
        self.assertEqual(
            [self.tabular.CROPS[c] for c in table.crops if c >= 0], list(self.model.crops)
        )
        unused = self.tabular.SLOT >= len(self.model.crops)
        self.assertFalse(table.mask[:, unused].any())
        last = table.node_t == self.model.horizon - 1
        self.assertTrue((table.next_node[last] == -1).all())
        self.assertTrue(np.allclose(table.odds[:7, :7].sum(axis=1), 1.0, atol=1e-5))

    def test_factored_reward_is_the_model_reward(self):
        table, model = self.table, self.model
        state = model.open_loop_state
        actions = self.tabular.ACTIONS
        for a in np.flatnonzero(table.mask[0]):
            action = actions[table.global_actions[a]]
            for y in range(len(model.years)):
                self.assertAlmostEqual(
                    float(table.reward[0, a, y]), model.outcome(state, action, y).reward, delta=0.01
                )

    def test_regional_costs(self):
        heartland = CostTable(region="Heartland")
        plain = CostTable()
        level = heartland.regional["corn"].usd_per_acre
        self.assertAlmostEqual(
            heartland.crop_cost("corn", "soybeans", "conventional").usd_per_acre, level
        )
        # the corn-after-corn difference comes from the state budgets
        self.assertAlmostEqual(
            heartland.crop_cost("corn", "corn", "conventional").usd_per_acre - level,
            plain.crop_cost("corn", "corn", "conventional").usd_per_acre
            - plain.crop_cost("corn", "soybeans", "conventional").usd_per_acre,
        )
        # ERS has no Heartland sorghum table: the national row is used and flagged
        self.assertFalse(heartland.crop_cost("sorghum", None, "conventional").verified)
        self.assertEqual(plain.crop_cost("corn", "soybeans", "strip_till").usd_per_acre, 633.97)

    def test_regional_tillage_costs(self):
        # tillage differences are field passes at the region's custom rates
        heartland = CostTable(region="Heartland")
        rate = {k: v.usd_per_acre for k, v in heartland.operations.items()}
        self.assertEqual((rate["chisel"], rate["strip_till"]), (20.75, 23.20))
        level = heartland.crop_cost("corn", "soybeans", "conventional")
        strip = heartland.crop_cost("corn", "soybeans", "strip_till")
        self.assertAlmostEqual(
            strip.usd_per_acre - level.usd_per_acre,
            rate["strip_till"] - rate["chisel"] - rate["field_cultivate"],
        )
        self.assertTrue(strip.verified)
        # the same shift on top of the corn-after-corn level
        self.assertAlmostEqual(
            heartland.crop_cost("corn", "corn", "strip_till").usd_per_acre
            - heartland.crop_cost("corn", "corn", "conventional").usd_per_acre,
            strip.usd_per_acre - level.usd_per_acre,
        )
        # drilled crops: reduced tillage drops the field cultivator pass
        self.assertAlmostEqual(
            heartland.tillage_shift("oats", "strip_till").usd_per_acre, -rate["field_cultivate"]
        )
        # regions differ
        plains = CostTable(region="Northern Great Plains")
        self.assertNotAlmostEqual(
            plains.tillage_shift("corn", "no_till").usd_per_acre,
            heartland.tillage_shift("corn", "no_till").usd_per_acre,
        )
        # a rate the region's survey lacks is the mean of the other regions, and flagged
        self.assertFalse(plains.operations["strip_till"].verified)
        self.assertFalse(plains.crop_cost("corn", "soybeans", "strip_till").verified)
        self.assertIn("strip_till", plains.unverified_tillages("corn"))
        self.assertNotIn("conventional", plains.unverified_tillages("corn"))
        rows = [
            {"region": "A", "operation": name, "usd_per_acre": usd, "verified": "true",
             "source": "a"}
            for name, usd in (("chisel", "20"), ("field_cultivate", "10"), ("plant", "25"))
        ] + [
            {"region": region, "operation": "strip_till", "usd_per_acre": usd,
             "verified": "true", "source": region}
            for region, usd in (("B", "22"), ("C", "26"))
        ]  # fmt: skip
        table = CostTable(region="A", tillage_rows=rows)
        self.assertEqual(table.operations["strip_till"].usd_per_acre, 24.0)
        self.assertEqual(table.tillage_shift("corn", "strip_till").usd_per_acre, -6.0)

    def test_regional_alfalfa_costs(self):
        plain = CostTable()
        heartland = CostTable(region="Heartland", state="IA")
        # the Iowa budget is the Heartland budget: same numbers as costs.csv at its own yield
        self.assertAlmostEqual(
            heartland.crop_cost("alfalfa", "alfalfa", "no_till").usd_per_acre,
            plain.crop_cost("alfalfa", "alfalfa", "no_till").usd_per_acre,
        )
        self.assertAlmostEqual(
            heartland.crop_cost("alfalfa", "corn", "conventional").usd_per_acre,
            plain.crop_cost("alfalfa", "corn", "conventional").usd_per_acre,
        )
        # another region has its own budget; established alfalfa has no tillage difference
        gateway = CostTable(region="Prairie Gateway", state="KS")
        established = gateway.crop_cost("alfalfa", "alfalfa", "conventional")
        self.assertEqual(established.usd_per_acre, 668.55)
        self.assertEqual(established, gateway.crop_cost("alfalfa", "alfalfa", "no_till"))
        self.assertLess(
            gateway.crop_cost("alfalfa", "winter_wheat", "no_till").usd_per_acre,
            gateway.crop_cost("alfalfa", "winter_wheat", "conventional").usd_per_acre,
        )
        # harvest cost follows the yield: the budget is for 5 tons
        self.assertAlmostEqual(
            gateway.crop_cost("alfalfa", "alfalfa", "no_till", 3.0).usd_per_acre,
            668.55 - 2 * gateway.harvest_per_ton.usd_per_acre,
        )
        # a state budget wins over the region's; a borrowed budget is flagged
        arizona = CostTable(region="Fruitful Rim", state="AZ")
        idaho = CostTable(region="Fruitful Rim", state="ID")
        self.assertEqual(arizona.crop_cost("alfalfa", "alfalfa", "no_till").usd_per_acre, 1578.43)
        self.assertEqual(idaho.crop_cost("alfalfa", "alfalfa", "no_till").usd_per_acre, 536.72)
        self.assertTrue(arizona.is_regional("alfalfa"))
        self.assertFalse(
            CostTable(region="Fruitful Rim", state="CA").alfalfa["seeding"][0].verified
        )
        self.assertEqual(
            CostTable(region="Southern Seaboard").unverified_tillages("alfalfa"), sorted(TILLAGE)
        )

    def test_learned_policy_trains_scores_and_reloads(self):
        try:
            import torch  # noqa: F401
        except ImportError:
            self.skipTest("PyTorch is not installed")
        from rule_engine.planner import ppo

        data = ppo.FieldSet([self.table, self.table])
        net = ppo.train(data, ppo.Config(envs=64, iterations=3, hidden=16), log=None)
        result = ppo.benchmark(net, data)
        self.assertLessEqual(result["learnedUsdPerAcre"], result["optimumUsdPerAcre"] + 0.1)
        with tempfile.TemporaryDirectory() as folder:
            ppo.LearnedPolicy(net).save(f"{folder}/policy.pt")
            policy = ppo.LearnedPolicy.load(f"{folder}/policy.pt")
        plan = evaluate(self.model, policy.act_for(self.model), "ppo")
        self.assertAlmostEqual(plan.value, result["learnedUsdPerAcre"], delta=1.0)


if __name__ == "__main__":
    unittest.main()
