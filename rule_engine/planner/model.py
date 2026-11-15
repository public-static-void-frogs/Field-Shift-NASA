"""The rotation planning problem as a Markov decision process.

State    last five crops, years planned so far, soil carbon pools, the year just experienced.
Action   crop x tillage x cover crop grown before it (invalid combinations are masked).
Chance   one historical year per step (weather, yields and prices together). Its odds depend on
         the year just experienced (chance.py): drought and price level carry over.
Reward   USD per acre per year: revenue - cost - risk penalty + soil carbon value - soil loss.

    revenue  = drawn-year yield x rotation and practice yield factors (engine rules) x soil
               water modifier x drawn-year price
    cost     = cost of production without land (ERS / extension budgets) + cover crop cost
               + pumping energy on an irrigated field, moved to the drawn year's real cost
               level (USDA ERS cost history, the same mean-1 convention as the prices)
    risk     = weight x engine points of every finding that is not already paid for in yield
    soil     = weight x change in stable soil carbon (t C/ha)
    erosion  = weight x soil lost to rain (USLE estimate, t/ha, erosion.py)

The crop history and the soil pools move deterministically with the action. The year just
experienced is the random part of the state: because it shifts the odds of the next year, the
best plan is a policy that reacts to it, not a fixed sequence. A state with `prev=None` does not
track it and sees each step's odds from the start of the plan; solving from
`open_loop_state` therefore gives the best fixed sequence. With `Persistence(strength=0)`, or
too few years, the years are independent and the two coincide.
"""

import math
from dataclasses import dataclass, field, replace

from rule_engine.engine import RotationAdvisor
from rule_engine.planner.adapter import RuleAdapter
from rule_engine.planner.chance import Persistence, build_chain
from rule_engine.planner.context import FieldContext
from rule_engine.planner.dynamics import Action, SoilCarbon, State, shift
from rule_engine.planner.erosion import YearlySoilLoss, number
from rule_engine.planner.sampler import Year, YearSampler
from rule_engine.planner.tables import (
    COVER,
    CROPS,
    DRILLED,
    TILLAGE,
    CostTable,
    ers_region,
    load_adjustments,
    load_carbon_inputs,
    needs_irrigation,
    processor_counties,
    state_crop_shares,
    t_ha_per,
)

DEFAULT_CROPS = CROPS
MAX_CROPS = 5  # crops planned for one field: the state's most grown ones among the usable
HA_PER_ACRE = 0.404686


@dataclass(frozen=True)
class Weights:
    """Preferences, not data. Change them to express what the farmer values."""

    risk_usd_per_point: float = 20.0  # USD/acre charged per engine risk point
    soil_usd_per_t_c: float = 50.0  # USD per tonne of stable carbon gained per hectare
    risk_aversion: float = 0.0  # subtract this many standard deviations of the yearly reward
    cover_cost_share_usd: float = 0.0  # USD/acre paid back for a cover crop (e.g. IDALS 20-30)
    erosion_usd_per_t: float = 5.0  # USD per tonne of soil lost per hectare


@dataclass(frozen=True)
class Outcome:
    reward: float
    revenue: float
    cost: float
    risk: float
    soil: float
    yield_per_acre: float
    price: float
    year: int
    detail: dict = field(default_factory=dict)
    erosion: float = 0.0  # USD/acre charged for the soil lost: in reward, not in cost


def _mean(values: list[float], weights: list[float]) -> float:
    return sum(v * w for v, w in zip(values, weights))


def annual_rain_mm(seasons) -> float | None:
    """Mean annual rain at the field from the April-October weekly rain of its seasons."""
    totals = []
    for season in seasons.values():
        weeks = [w for w in season.weekly.get("pr_mm") or [] if w is not None and w == w]
        if len(weeks) >= 28:
            totals.append(sum(weeks) * 31 / len(weeks))
    if not totals:
        return None
    return sum(totals) / len(totals) / number("season_share_of_annual_rain")


class RotationModel:
    def __init__(
        self,
        context: FieldContext,
        advisor: RotationAdvisor,
        crops: tuple[str, ...] | None = None,
        priorities: tuple[str, ...] = (),
        horizon: int = 5,
        weights: Weights = Weights(),
        tillage: tuple[str, ...] = TILLAGE,
        cover: tuple[str, ...] = COVER,
        costs: CostTable | None = None,
        soil_carbon: SoilCarbon = SoilCarbon(),
        persistence: Persistence = Persistence(),
        max_crops: int | None = MAX_CROPS,
    ):
        self.context, self.advisor = context, advisor
        self.horizon, self.weights = horizon, weights
        self.costs = costs or CostTable(
            region=ers_region(context.field.get("countyFips")),
            state=context.region,
            county=str(context.field.get("countyFips") or "").zfill(5) or None,
        )
        self.soil_carbon = soil_carbon
        self.carbon_inputs = load_carbon_inputs()
        self.adjustments = load_adjustments()
        self.adapter = RuleAdapter(advisor, context, priorities)
        candidates = set(advisor.candidate_ids(context.region))
        wanted = [c for c in (crops or DEFAULT_CROPS)]
        self.gaps: list[dict] = list(context.gaps)
        usable = []
        irrigated = context.irrigation_status == "irrigated"
        processors = processor_counties()
        county = str(context.field.get("countyFips") or "").zfill(5)
        for crop in wanted:
            if crop not in candidates:
                self.gaps.append({"code": "crop_not_candidate", "crop": crop})
            elif needs_irrigation(crop, context.region) and not irrigated:
                self.gaps.append({"code": f"{crop}_needs_irrigation", "crop": crop})
            elif (
                crop in processors
                and county not in processors[crop]
                and crop not in context.history
            ):
                # sold under contract to a nearby factory, or as hay within trucking distance:
                # planned only where the county grows it (CDL, a satellite estimate) or the
                # field itself grew it
                code = {
                    "alfalfa": "no_hay_market_nearby",
                    "rice": "not_a_rice_county",
                }.get(crop, "no_processor_nearby")
                self.gaps.append({"code": code, "crop": crop})
            elif crop not in self.costs.crops:
                self.gaps.append({"code": "no_cost_budget", "crop": crop})
            else:
                usable.append(crop)
        self.sampler = YearSampler(context, advisor, self.adapter, usable)
        for crop, reason in self.sampler.unavailable.items():
            self.gaps.append({"code": reason, "crop": crop})
        modellable = [c for c in usable if c in self.sampler.basis]
        if crops is None and max_crops and len(modellable) > max_crops:
            # keep the crops most grown in the state (CDL acre share); the rest are not planned
            shares = state_crop_shares()
            ranked = sorted(modellable, key=lambda c: -shares.get((context.region, c), 0.0))
            for crop in ranked[max_crops:]:
                self.gaps.append({"code": "crop_left_out_of_plan", "crop": crop})
            modellable = [c for c in modellable if c in ranked[:max_crops]]
        self.crops = tuple(modellable)
        if not self.crops:
            raise ValueError("no crop has a cost budget, a price and a yield for this field")
        if not self.sampler.years:
            raise ValueError("no historical year to draw from")
        self.years: list[Year] = self.sampler.years
        self.chain = build_chain(self.years, context.seasons, self.sampler.basis, persistence)
        self._uniform = [1.0 / len(self.years)] * len(self.years)
        self.tillage, self.cover = tuple(tillage), tuple(cover)
        self.all_actions = [
            Action(c, t, k) for c in self.crops for t in self.tillage for k in self.cover
        ]
        self._lifecycle = {c: advisor.catalog.crops[c].value("lifecycle") for c in self.crops}
        self._season = {c: advisor.catalog.crops[c].value("season") for c in self.crops}
        self._base: dict = {}
        self._expected: dict = {}
        self.soil_loss = YearlySoilLoss(context.soil, annual_rain_mm(context.seasons))
        self.gaps += self.soil_loss.gaps
        self.irrigated = irrigated
        # the year's cost moves the crop's budget (conventional tillage, no special history, at
        # the expected yield) by its real cost level; the action's own differences stay fixed
        self._cost_shift: dict[str, list[float]] = {}
        for crop in self.crops:
            index = self.costs.year_index(crop)
            base = self.costs.crop_cost(
                crop, None, "conventional", self.sampler.basis[crop].expected_yield
            ).usd_per_acre
            self._cost_shift[crop] = [base * (index.get(y.year, 1.0) - 1.0) for y in self.years]
        young, old = soil_carbon.initial(context.soil)
        latest = self.chain.latest if self.chain else None
        self.initial_state = State(0, context.history, young, old, latest)
        self.open_loop_state = replace(self.initial_state, prev=None)
        if self.chain:
            self.gaps.append({"code": "year_odds_from_few_analog_years", "years": len(self.years)})
        if old is None:
            self.gaps.append({"code": "soil_organic_matter_unknown", "affects": ["soil_carbon"]})
        elif not soil_carbon.verified:
            self.gaps.append({"code": "soil_carbon_model_uncalibrated"})
        self._data_gaps()

    # -- actions and transition ---------------------------------------------------------

    def actions(self, state: State) -> list[Action]:
        previous = state.history[-1] if state.history else None
        out = []
        for action in self.all_actions:
            established = self._lifecycle[action.crop] == "perennial" and previous == action.crop
            if established and action.tillage != self.tillage[-1]:
                continue  # a standing perennial is not tilled: keep one representative action
            if action.cover != "none":
                previous_perennial = (
                    previous is not None
                    and self.advisor.catalog.crops[previous].value("lifecycle") == "perennial"
                )
                if self._season[action.crop] != "warm" or previous_perennial or established:
                    continue  # an overwintering cover crop fits only before a spring-planted crop
            if self._returns_too_soon(state.history, action.crop):
                continue  # sugarbeets, flax: at most once in their minimum return interval
            out.append(action)
        return out or list(self.all_actions)

    def _returns_too_soon(self, history: tuple[str, ...], crop: str) -> bool:
        """True when the crop grew within its minimum return interval (crop_adjustments.csv
        `<crop>_min_return_years`: 3 means at least two other crops in between)."""
        row = self.adjustments.get(f"{crop}_min_return_years")
        if row is None:
            return False
        recent = int(row["value"]) - 1
        return recent > 0 and crop in history[-recent:]

    def expected_yield_t_ha(self, state: State, action: Action) -> float:
        crop = self.advisor.catalog.crops[action.crop]
        basis = self.sampler.basis[action.crop]
        per_acre = (
            basis.expected_yield
            * self.adapter.history_part(
                state.history, action.crop, action.tillage, action.cover
            ).factor
            * self._establishment(state, action)
        )
        return per_acre * (t_ha_per(crop, basis.unit) or 0.0)

    def distribution(self, state: State) -> list[float]:
        """Odds of each drawable year for the coming season."""
        if self.chain is None:
            return self._uniform
        if state.prev is None:
            return self.chain.marginal(state.t)
        return self.chain.matrix[state.prev]

    def transition(self, state: State, action: Action, year_index: int | None = None) -> State:
        """Next state; `year_index` is the year that was drawn, needed when the state tracks it."""
        tracked = self.chain is not None and state.prev is not None
        if tracked and year_index is None:
            raise ValueError("this state tracks the year just experienced: pass year_index")
        young, old = self._advance(state, action)
        history = shift(state.history, action.crop)
        return State(state.t + 1, history, young, old, year_index if tracked else None)

    def _advance(self, state: State, action: Action) -> tuple[float | None, float | None]:
        young, old = state.young, state.old
        if old is not None:
            crop = self.advisor.catalog.crops[action.crop]
            added = self.soil_carbon.stable_input(
                crop, self.expected_yield_t_ha(state, action), action.cover, self.carbon_inputs
            )
            young, old = self.soil_carbon.step(young, old, added)
        return young, old

    def terminal(self, state: State) -> bool:
        return state.t >= self.horizon

    # -- reward -------------------------------------------------------------------------

    def _establishment(self, state: State, action: Action) -> float:
        previous = state.history[-1] if state.history else None
        if previous == action.crop:
            return 1.0
        # the field's own seeding budget, so its cost and its yield assume the same harvest
        budget = self.costs.seeding_year_yield(action.crop)
        if budget is not None:
            return budget
        row = self.adjustments.get(f"{action.crop}_seeding_year_yield")
        return row["value"] if row else 1.0

    def _water_modifier(self, drought_loss: float) -> float:
        """Scale the season's drought loss by the field's water storage against the reference.

        Direction is supported by Mieno (UNL 2025, preliminary): low water-holding soils lose
        about 50 bu/acre more corn in a severe deficit year. The proportional form is a heuristic.
        """
        aws, reference = self.context.soil.get("aws_100cm_mm"), self.context.reference_aws_mm
        if not aws or not reference or not drought_loss:
            return 1.0
        scale = min(2.0, max(0.5, reference / float(aws)))
        return max(0.5, 1.0 - drought_loss * (scale - 1.0))

    def _soil_reward(self, state: State, action: Action) -> float:
        if state.old is None or not self.weights.soil_usd_per_t_c:
            return 0.0
        gain_t_c_ha = sum(self._advance(state, action)) - state.stable_carbon
        return self.weights.soil_usd_per_t_c * gain_t_c_ha * HA_PER_ACRE  # USD/acre

    def soil_loss_t_ha(self, action: Action) -> float:
        drilled = action.crop in DRILLED
        return self.soil_loss.t_per_ha(action.crop, action.tillage, action.cover, drilled)

    def _erosion_usd(self, action: Action) -> float:
        return self.weights.erosion_usd_per_t * self.soil_loss_t_ha(action) * HA_PER_ACRE

    def _fixed_cost(self, action: Action, previous: str | None, establishment: float) -> float:
        """USD/acre of the action that does not change with the drawn year."""
        cost_usd = (
            self._crop_cost(action, previous, establishment).usd_per_acre
            + self.costs.cover_cost(action.cover).usd_per_acre
        )
        status = self.context.irrigation_status
        cost_usd += self.costs.irrigation_cost(action.crop, status).usd_per_acre
        if action.cover != "none":
            cost_usd -= self.weights.cover_cost_share_usd
        return cost_usd

    def factors(self, history: tuple[str, ...], action: Action) -> tuple[float, float]:
        """(a, b) of the yearly reward a x gain[year] + b + weather[year], soil term excluded.

        `gain` and `weather` come from `year_terms` and depend only on the crop, so a table of
        (a, b) per crop history and action plus one row per crop and year holds every reward.
        """
        previous = history[-1] if history else None
        part = self.adapter.history_part(history, action.crop, action.tillage, action.cover)
        establishment = self._establishment(State(0, history, None, None), action)
        cost_usd = self._fixed_cost(action, previous, establishment)
        scale = part.factor * establishment
        fixed = -cost_usd - self.weights.risk_usd_per_point * part.points
        return scale, fixed - self._erosion_usd(action)

    def _crop_cost(self, action: Action, previous: str | None, establishment: float):
        """The crop's cost at the yield the field expects (the seeding year yields less)."""
        expected = self.sampler.basis[action.crop].expected_yield * establishment
        return self.costs.crop_cost(action.crop, previous, action.tillage, expected)

    def year_terms(self, crop: str) -> tuple[list[float], list[float]]:
        """Per drawable year: revenue before the history factors, and the weather risk penalty
        less the year's cost shift."""
        gain, weather = [], []
        for year, shift_usd in zip(self.years, self._cost_shift[crop], strict=True):
            draw = year.crops[crop]
            points = 0.0
            if draw.weather is not None:
                points = draw.weather.county_points + sum(
                    hit.points for hit in draw.weather.hazards if hit.rule not in draw.paid_rules
                )
            gain.append(draw.yield_per_acre * self._water_modifier(draw.drought_loss) * draw.price)
            weather.append(-self.weights.risk_usd_per_point * points - shift_usd)
        return gain, weather

    def _base_outcomes(self, history: tuple[str, ...], action: Action) -> list[Outcome]:
        """Everything except the soil term, for every drawable year."""
        key = (history, action)
        if key in self._base:
            return self._base[key]
        previous = history[-1] if history else None
        part = self.adapter.history_part(history, action.crop, action.tillage, action.cover)
        state = State(0, history, None, None)
        establishment = self._establishment(state, action)
        fixed_cost = self._fixed_cost(action, previous, establishment)
        erosion = self._erosion_usd(action)
        outcomes = []
        for year, shift_usd in zip(self.years, self._cost_shift[action.crop], strict=True):
            draw = year.crops[action.crop]
            cost_usd = fixed_cost + shift_usd
            weather_points, unpaid = 0.0, []
            if draw.weather is not None:
                for hit in draw.weather.hazards:
                    if hit.rule not in draw.paid_rules:
                        weather_points += hit.points
                        unpaid.append(hit.rule)
                weather_points += draw.weather.county_points
            water = self._water_modifier(draw.drought_loss)
            yield_per_acre = draw.yield_per_acre * part.factor * establishment * water
            revenue = yield_per_acre * draw.price
            risk = self.weights.risk_usd_per_point * (part.points + weather_points)
            outcomes.append(
                Outcome(
                    reward=revenue - cost_usd - risk - erosion,
                    revenue=revenue,
                    cost=cost_usd,
                    risk=risk,
                    soil=0.0,
                    yield_per_acre=yield_per_acre,
                    price=draw.price,
                    year=year.year,
                    detail={
                        "yieldMode": draw.mode,
                        "yieldAnomaly": round(draw.anomaly, 3),
                        "ruleYieldFactor": round(part.factor, 3),
                        "waterModifier": round(water, 3),
                        "establishmentFactor": establishment,
                        "rulePoints": part.points,
                        "weatherPoints": weather_points,
                        "hazardsAsPoints": unpaid,
                        "costShiftUsdPerAcre": round(shift_usd, 2),
                    },
                    erosion=erosion,
                )
            )
        self._base[key] = outcomes
        return outcomes

    def outcome(self, state: State, action: Action, year_index: int) -> Outcome:
        base = self._base_outcomes(state.history, action)[year_index]
        soil = self._soil_reward(state, action)
        return Outcome(**{**base.__dict__, "reward": base.reward + soil, "soil": soil})

    def expected(self, state: State, action: Action) -> float:
        """Mean yearly reward under the state's year odds, less risk_aversion x its spread."""
        odds = (
            None if self.chain is None else state.prev if state.prev is not None else -state.t - 1
        )
        key = (state.history, action, odds)
        if key not in self._expected:
            rewards = [o.reward for o in self._base_outcomes(state.history, action)]
            weights = self.distribution(state)
            average = _mean(rewards, weights)
            spread = math.sqrt(_mean([(r - average) ** 2 for r in rewards], weights))
            self._expected[key] = (average, spread)
        average, spread = self._expected[key]
        return average - self.weights.risk_aversion * spread + self._soil_reward(state, action)

    def summary(self, state: State, action: Action) -> dict:
        """Expected breakdown of one step, for reports."""
        outcomes = self._base_outcomes(state.history, action)
        part = self.adapter.history_part(state.history, action.crop, action.tillage, action.cover)
        rewards = [o.reward for o in outcomes]
        soil = self._soil_reward(state, action)
        odds = self.distribution(state)
        return {
            "crop": action.crop,
            "tillage": action.tillage,
            "coverCrop": action.cover,
            "expectedUsdPerAcre": round(_mean(rewards, odds) + soil, 2),
            "worstYearUsdPerAcre": round(min(rewards) + soil, 2),
            "bestYearUsdPerAcre": round(max(rewards) + soil, 2),
            "worstYear": outcomes[rewards.index(min(rewards))].year,
            "revenueUsdPerAcre": round(_mean([o.revenue for o in outcomes], odds), 2),
            "costUsdPerAcre": round(_mean([o.cost for o in outcomes], odds), 2),
            "riskPenaltyUsdPerAcre": round(_mean([o.risk for o in outcomes], odds), 2),
            "soilValueUsdPerAcre": round(soil, 2),
            "soilLossTPerHa": round(self.soil_loss_t_ha(action), 2),
            "erosionUsdPerAcre": round(outcomes[0].erosion, 2),
            "yieldPerAcre": round(_mean([o.yield_per_acre for o in outcomes], odds), 2),
            "yieldUnit": self.sampler.basis[action.crop].unit + "/acre",
            "yieldRules": [r[0] for r in part.yield_rules],
            "pointRules": [r[0] for r in part.point_rules],
            "weakRules": list(part.weak_rules),
        }

    def key(self, state: State) -> tuple:
        """Hashable state for tabular solvers; the soil pools are rounded to 0.05 t C/ha."""
        if state.old is None or not self.weights.soil_usd_per_t_c:
            return state.t, state.history, state.prev
        pools = round(state.young / 0.05), round(state.old / 0.05)
        return state.t, state.history, state.prev, *pools

    # -- data gaps ----------------------------------------------------------------------

    def _data_gaps(self) -> None:
        for crop in self.crops:
            basis = self.sampler.basis[crop]
            for note in basis.notes:
                self.gaps.append({"code": note, "crop": crop})
            if not basis.yield_verified:
                self.gaps.append({"code": "yield_unverified", "crop": crop})
            modes = {y.crops[crop].mode for y in self.years}
            if modes != {"observed"}:
                self.gaps.append(
                    {
                        "code": "yield_not_observed_every_year",
                        "crop": crop,
                        "years": {
                            m: [y.year for y in self.years if y.crops[crop].mode == m]
                            for m in sorted(modes - {"observed"})
                        },
                    }
                )
            unverified = self.costs.unverified_tillages(crop)
            if unverified:
                self.gaps.append({"code": "cost_unverified", "crop": crop, "tillage": unverified})
            if not self.costs.is_regional(crop) and self.context.region != "IA":
                self.gaps.append({"code": "cost_budget_from_another_state", "crop": crop})
            if not self.costs.year_index(crop):
                self.gaps.append({"code": "cost_same_every_year", "crop": crop})
            irrigation = self.costs.irrigation_cost(crop, self.context.irrigation_status)
            if irrigation.usd_per_acre:
                self.gaps.append(
                    {
                        "code": "irrigation_cost_estimated",
                        "crop": crop,
                        "usdPerAcre": round(irrigation.usd_per_acre, 2),
                        "budgetIrrigatedShare": round(self.costs.irrigation_share(crop), 4),
                        "verified": irrigation.verified,
                    }
                )
        status = self.context.irrigation_status
        if status is None:
            self.gaps.append({"code": "irrigation_status_unknown", "affects": ["yield", "cost"]})
        else:
            self.gaps.append(
                {"code": "irrigation_status_is_satellite_estimate", "status": status,
                 "source": (self.context.field.get("irrigation") or {}).get("source")}
            )  # fmt: skip
        if "rye" in self.cover and not self.costs.cover_cost("rye").verified:
            self.gaps.append({"code": "cover_crop_seed_cost_unverified"})
        if self.context.history_source == "cdl":
            self.gaps.append({"code": "history_is_satellite_estimate", "source": "USDA CDL/CSB"})
