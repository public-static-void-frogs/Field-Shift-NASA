"""Week-based rotation plan: what to plant in which week, starting from a date.

    python -m rule_engine.planner.weekly --field 191825000015314 \
        --fields data/local/usa_sample_v2/fields.jsonl \
        --summaries data/local/usa_sample_v2/work/season_summary \
        --gridmet data/local/usa_sample_v2/work/gridmet --start 2026-11-15 --years 3

The clock moves in weeks from the start date. A decision is taken only in a week when the field
is free: wait a week, seed a rye cover, or plant a crop with a tillage system. Planting sends the
clock to the week after that crop's harvest. When that is depends on the weather of the season
that is drawn: the crop matures after the heat sum (or the number of days) its state needs
(data/crop_heat_units.csv), counted on the field's own daily weather of one historical year.

The money of a crop is the yearly model's (`RotationModel.factors` and `year_terms`): the yield
and price of the drawn year, the rotation effects of the crops before it, the regional cost. Two
things are added: the yield lost by planting later than the state usually does
(data/planting_date_response.csv), and the share of its heat a warm-season crop reached when an
autumn frost came first. Soil is scored next to the money, in its own units: stable soil carbon
added by residues, soil lost to water erosion (USLE, week by week, by what covers the ground),
and two indicators that carry no price: the crop's water need against rain and stored water, and
the nitrogen a legume leaves for the next crop. `Preferences` prices carbon and soil loss.

Simplifications, all reported under dataGaps:
- every crop draws its season independently of the one before (the yearly model can carry dry
  and wet spells over; this one does not);
- the field is taken to be free on the start date;
- a second crop in one year enters the crop history as if it were another year.
"""

import argparse
import csv
import json
import math
from bisect import bisect_left
from dataclasses import dataclass, replace
from datetime import date, timedelta
from functools import lru_cache
from itertools import accumulate
from pathlib import Path

from rule_engine.facts import crop_history
from rule_engine.planner.context import FieldContext
from rule_engine.planner.dynamics import Action, State, shift
from rule_engine.planner.erosion import (  # noqa: F401  (re-exported)
    SI_TO_US_EROSIVITY,
    annual_erosivity,
    load_crop_factors,
    load_parameters,
    slope_factor,
)
from rule_engine.planner.erosion import number as _number
from rule_engine.planner.model import HA_PER_ACRE, RotationModel
from rule_engine.planner.tables import DRILLED

DATA = Path(__file__).parent / "data"
TERMS = ("revenue", "cost", "risk", "carbon", "erosion", "deficit", "short", "nitrogen", "crops")
ZERO = (0.0,) * len(TERMS)
FALLOW = "fallow"  # catalog id of a year without a crop
TIE_USD_PER_DAY = 0.01  # prefers the usual planting day between plans that are otherwise equal


def _terms(**values: float) -> tuple[float, ...]:
    return tuple(values.get(name, 0.0) for name in TERMS)


def _add(left: tuple, right: tuple, weight: float = 1.0) -> tuple:
    return tuple(a + weight * b for a, b in zip(left, right))


@dataclass(frozen=True)
class Preferences:
    """What the farmer values next to money. Preferences, not data."""

    soil_usd_per_t_c: float = 50.0  # USD per tonne of stable carbon gained per hectare
    erosion_usd_per_t: float = 5.0  # USD per tonne of soil lost per hectare

    def score(self, terms: tuple) -> float:
        """USD per acre of one bundle of terms."""
        money = terms[0] - terms[1] - terms[2]
        return money + HA_PER_ACRE * (
            self.soil_usd_per_t_c * terms[3] - self.erosion_usd_per_t * terms[4]
        )


# -- tables --------------------------------------------------------------------------------


# NASS publishes no Crop Progress series for chickpeas. They are grown on the same farms as
# lentils (Montana, North Dakota, the Palouse), planted with them in spring, and harvested with
# them or up to a few weeks later; the lentil row is a stand-in and is reported as a gap.
BORROWED_PHENOLOGY = {"chickpeas": "lentils"}


@dataclass(frozen=True)
class Phenology:
    crop: str
    plant_doy: int  # usual planting day, counted from 1 January of the harvest year
    days: int  # planting to maturity
    heat: float  # degree days from planting to maturity
    base_c: float
    cap_c: float
    method: str  # heat | days | season (a perennial: until the last cutting)
    harvest_lag: int  # days from maturity to harvest
    region: str  # the state the numbers are from
    borrowed_from: str = ""  # the crop whose numbers these are, when the crop has none of its own


@lru_cache(maxsize=1)
def _phenology_rows() -> tuple[dict, ...]:
    with (DATA / "crop_heat_units.csv").open() as handle:
        return tuple(csv.DictReader(handle))


def load_phenology(region: str) -> dict[str, Phenology]:
    """Per crop, the state's row; where the state has none, the row of the state whose usual
    planting day is the middle one (`Phenology.region` then names that state)."""
    by_crop: dict[str, list[dict]] = {}
    for row in _phenology_rows():
        by_crop.setdefault(row["crop"], []).append(row)
    found = {}
    for crop, rows in by_crop.items():
        own = [r for r in rows if r["region"] == region]
        ordered = sorted(rows, key=lambda r: int(r["plant_doy"]))
        row = own[0] if own else ordered[len(ordered) // 2]
        found[crop] = Phenology(
            crop=crop,
            plant_doy=int(row["plant_doy"]),
            days=int(row["days_to_maturity"]),
            heat=float(row["gdd_to_maturity"]),
            base_c=float(row["base_c"]),
            cap_c=float(row["cap_c"]),
            method=row["method"] if own else "days",
            harvest_lag=int(row["harvest_lag_days"]),
            region=row["region"],
        )
    if "oats" in found:  # alfalfa is seeded when the spring small grains are
        oats = found["oats"]
        end = int(_number("alfalfa_season_end_doy"))
        found["alfalfa"] = Phenology(
            "alfalfa", oats.plant_doy, end - oats.plant_doy, 0.0, 0.0, 0.0, "season", 0, oats.region
        )
    for crop, like in BORROWED_PHENOLOGY.items():
        if crop not in found and like in found:
            found[crop] = replace(found[like], crop=crop, borrowed_from=like)
    return found


@dataclass(frozen=True)
class DateResponse:
    """Yield against the planting date, from trials; days are counted from the trial's optimum."""

    lead: int  # days by which the usual planting day of the trial's state follows the optimum
    points: tuple[tuple[int, float], ...]

    def _at(self, day: float) -> float:
        points = self.points
        if day <= points[0][0]:
            return points[0][1]
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            if day <= x1:
                return y0 + (y1 - y0) * (day - x0) / (x1 - x0)
        return points[-1][1]

    @property
    def last_day(self) -> int:
        """Latest planting the trials cover, in days after the usual planting day."""
        return self.points[-1][0] - self.lead

    def relative(self, days_after_usual: float) -> float | None:
        """Yield against planting on the usual day (never above 1); None past the trial dates."""
        if days_after_usual > self.last_day:
            return None
        return min(1.0, self._at(days_after_usual + self.lead) / self._at(self.lead))


@lru_cache(maxsize=1)
def load_date_responses() -> dict[str, DateResponse]:
    rows: dict[str, list[dict]] = {}
    with (DATA / "planting_date_response.csv").open() as handle:
        for row in csv.DictReader(handle):
            rows.setdefault(row["crop"], []).append(row)
    return {
        crop: DateResponse(
            int(found[0]["lead_days"]),
            tuple(
                sorted(
                    (int(r["days_after_optimum"]), float(r["relative_yield_pct"])) for r in found
                )
            ),
        )
        for crop, found in rows.items()
    }


# -- weather -------------------------------------------------------------------------------


class DailyWeather:
    """Daily weather of one field as one run of days: {year: [(tmax C, tmin C, rain mm, ETo mm)]}.

    With `target_year` every year's temperatures are moved along the field's own linear
    temperature trend to that year, so a season of the 1980s is replayed in today's climate.
    Rain and reference evapotranspiration are not moved.
    """

    def __init__(self, years: dict[int, list[tuple]], target_year: int | None = None):
        if not years:
            raise ValueError("no daily weather")
        self.years = sorted(years)
        self.first: dict[int, int] = {}  # year -> index of its 1 January
        self.length: dict[int, int] = {}
        self._end: list[int] = []  # index -> end of the unbroken run of years it belongs to
        tmax, tmin, rain, eto, year_of = [], [], [], [], []
        mean = {}
        for year in self.years:
            rows = years[year]
            self.first[year], self.length[year] = len(tmax), len(rows)
            mean[year] = sum((r[0] + r[1]) / 2 for r in rows) / len(rows)
            for row in rows:
                tmax.append(row[0])
                tmin.append(row[1])
                rain.append(row[2])
                eto.append(row[3])
                year_of.append(year)
        self.trend_c_per_year = _slope(mean) if target_year and len(mean) >= 10 else 0.0
        self.target_year = target_year
        move = {y: self.trend_c_per_year * ((target_year or y) - y) for y in self.years}
        self.tmax = [t + move[y] for t, y in zip(tmax, year_of)]
        self.tmin = [t + move[y] for t, y in zip(tmin, year_of)]
        self.rain, self.eto = rain, eto
        self.size = len(tmax)
        end = self.size
        ends = {}
        for year in reversed(self.years):
            if year + 1 not in self.first:
                end = self.first[year] + self.length[year]
            ends[year] = end
        self._end = [ends[y] for y in year_of]
        self._year_of = year_of
        self._rain_sum = [0.0, *accumulate(rain)]
        self._eto_sum = [0.0, *accumulate(eto)]
        self._heat: dict[tuple[float, float], list[float]] = {}
        self._frost: dict[float, list[int]] = {}
        self.annual_rain_mm = sum(rain) / len(self.years)

    @classmethod
    def from_gridmet(
        cls, field_id: str, root: Path | str, target_year: int | None = None
    ) -> "DailyWeather":
        """Read one field from the yearly gridMET parquet files of the national sample."""
        import duckdb

        con = duckdb.connect()
        con.execute("SET memory_limit='2GB'; SET threads=4")
        rows = con.execute(
            "SELECT year, gridmet_tmax_c, gridmet_tmin_c, gridmet_pr_mm, gridmet_eto_grass_mm "
            "FROM read_parquet(?) WHERE CSBID = ? ORDER BY year, doy",
            [str(Path(root) / "*.parquet"), str(field_id)],
        ).fetchall()
        years: dict[int, list[tuple]] = {}
        for year, *values in rows:
            if None not in values:
                years.setdefault(int(year), []).append(tuple(values))
        return cls({y: v for y, v in years.items() if len(v) >= 365}, target_year)

    def position(self, year: int, day: date) -> int | None:
        """Index of the calendar day of `day` in the historical `year`."""
        if year not in self.first:
            return None
        offset = (day - date(day.year, 1, 1)).days
        return self.first[year] + min(offset, self.length[year] - 1)

    def year_at(self, position: int) -> int:
        return self._year_of[position]

    def run_end(self, position: int) -> int:
        return self._end[position]

    def heat(self, base_c: float, cap_c: float) -> list[float]:
        """Running sum of growing degree days; entry i is the heat of the days before day i."""
        key = (base_c, cap_c)
        if key not in self._heat:
            daily = (
                max(0.0, (min(hi, cap_c) + max(min(lo, cap_c), base_c)) / 2 - base_c)
                for hi, lo in zip(self.tmax, self.tmin)
            )
            self._heat[key] = [0.0, *accumulate(daily)]
        return self._heat[key]

    def next_frost(self, position: int, threshold_c: float) -> int:
        """First day from `position` on with a minimum at or below the threshold."""
        if threshold_c not in self._frost:
            found, after = [self.size] * (self.size + 1), self.size
            for index in range(self.size - 1, -1, -1):
                if self.tmin[index] <= threshold_c:
                    after = index
                found[index] = after
            self._frost[threshold_c] = found
        return self._frost[threshold_c][position]

    def rain_between(self, start: int, end: int) -> float:
        return self._rain_sum[end] - self._rain_sum[start]

    def eto_between(self, start: int, end: int) -> float:
        return self._eto_sum[end] - self._eto_sum[start]

    def erosive_share(self, threshold_mm: float) -> list[float]:
        """Share of the year's erosive rain that falls in each of 52 weeks of the year."""
        weeks = [0.0] * 52
        for year in self.years:
            first = self.first[year]
            for offset in range(self.length[year]):
                amount = self.rain[first + offset]
                if amount >= threshold_mm:
                    weeks[min(offset // 7, 51)] += amount
        total = sum(weeks)
        return [w / total for w in weeks] if total else [1 / 52] * 52


def _slope(points: dict[int, float]) -> float:
    n = len(points)
    mean_x, mean_y = sum(points) / n, sum(points.values()) / n
    spread = sum((x - mean_x) ** 2 for x in points)
    return sum((x - mean_x) * (y - mean_y) for x, y in points.items()) / spread if spread else 0.0


# -- the weekly problem --------------------------------------------------------------------


@dataclass(frozen=True)
class Spot:
    """A week in which the field is free."""

    week: int
    history: tuple[str, ...]
    cover: bool = False  # a rye cover is growing
    tilled: float = 1.0  # USLE tillage factor of the last crop's system: how bare it left the soil
    harvested: int = 0  # calendar year of the last harvest


@dataclass(frozen=True)
class Move:
    kind: str  # wait | seed_cover | plant
    action: Action | None = None
    days_from_usual: int = 0
    skipped: int = 0  # calendar years without a harvest before this crop

    def label(self) -> str:
        return self.kind if self.action is None else f"plant {self.action.label()}"


@dataclass(frozen=True)
class Branch:
    free_week: int
    odds: float
    gain: float  # revenue before the rotation factors, mean over the branch's years
    weather: float  # weather risk penalty of those years, USD/acre (not above zero)


@dataclass(frozen=True)
class Cycle:
    """One crop planted in one week: when the field is free again, and what the years give."""

    crop: str
    week: int
    days_from_usual: int
    relative: float  # yield against planting on the usual day
    reached: float  # mean share of the needed heat reached before frost
    matured: float  # share of years in which the crop matured before frost
    branches: tuple[Branch, ...]
    harvest_days: tuple[int, ...]  # days from planting to harvest, one per year, sorted
    water: tuple[float, float, float] | None  # mean need mm, mean rain mm, mean shortfall mm
    short: float  # share of years with a shortfall


class WeeklyPlanner:
    def __init__(
        self,
        model: RotationModel,
        weather: DailyWeather,
        start: date,
        weeks: int = 156,
        slope_length_m: float | None = None,
    ):
        self.model, self.weather = model, weather
        self.start, self.horizon = start, weeks
        self.gaps: list[dict] = list(model.gaps)
        self.phenology = load_phenology(model.context.region)
        self.responses = load_date_responses()
        self.factors = load_crop_factors()
        self.terms = {crop: model.year_terms(crop) for crop in model.crops}
        self.conventional, self.gentlest = model.tillage[0], model.tillage[-1]
        self._early = int(_number("plant_early_days"))
        self._late = {"alfalfa": int(_number("alfalfa_seed_late_days"))}
        self._frost_c = _number("killing_frost_c")
        self._frost_from = int(_number("frost_from_doy"))
        self._required = _number("mature_share_required")
        self._season_end = int(_number("alfalfa_season_end_doy"))
        self._rye = tuple(
            int(_number(name)) for name in ("rye_first_doy", "rye_last_doy", "rye_cleared_doy")
        )
        self._stages = tuple(float(s) for s in load_parameters()["kc_stage_shares"].split("/"))
        cover = model.costs.cover_cost("rye") if "rye" in model.cover else None
        self._cover_usd = (cover.usd_per_acre - model.weights.cover_cost_share_usd) if cover else 0
        self._cover_factor = _number("usle_cover_crop_factor")
        self._cycles: dict = {}
        self._moves: dict = {}
        self._economics: dict = {}
        self._actions: dict = {}
        self._erosion_setup(slope_length_m)
        # the carbon model is for mineral soils: an organic surface layer is outside it
        old, organic = model.initial_state.old, _number("organic_soil_om_pct")
        self.carbon_known = old is not None and float(model.context.soil["om_pct"]) <= organic
        self.carbon_loss_per_week = 0.0  # decay of the stable pool, the same under every plan
        if self.carbon_known:
            carbon = model.soil_carbon
            self.carbon_loss_per_week = old * (1 - math.exp(-carbon.k_old * carbon.climate / 52))
        elif old is not None:
            self.gaps.append({"code": "soil_carbon_not_scored_organic_soil"})
        for crop in model.crops:
            pheno = self.phenology.get(crop)
            if pheno is None:
                self.gaps.append({"code": "no_growing_time", "crop": crop})
            elif pheno.borrowed_from:
                self.gaps.append(
                    {"code": "growing_time_from_another_crop", "crop": crop,
                     "from": pheno.borrowed_from, "state": pheno.region}
                )  # fmt: skip
            elif pheno.region != model.context.region:
                self.gaps.append(
                    {"code": "growing_time_from_another_state", "crop": crop, "state": pheno.region}
                )
            if crop not in self.responses and pheno is not None:
                self.gaps.append({"code": "no_planting_date_response", "crop": crop})
        self.gaps += [
            {"code": "seasons_drawn_independently"},
            {"code": "field_assumed_free_at_start", "start": start.isoformat()},
            {"code": "second_crop_counts_as_a_year_in_the_history"},
            {"code": "water_and_nitrogen_are_indicators_without_a_price"},
        ]

    # -- erosion ----------------------------------------------------------------------------

    def _erosion_setup(self, slope_length_m: float | None) -> None:
        soil = self.model.context.soil
        erodibility, slope = soil.get("kw"), soil.get("slope_pct")
        self._soil_loss_unit = None  # t/ha per unit of erosive share and cover factor
        self.erosivity = None
        if erodibility is None or slope is None:
            self.gaps.append({"code": "soil_loss_unknown_no_erodibility_or_slope"})
        else:
            length = slope_length_m or soil.get("slope_length_m") or _number("slope_length_m")
            self.erosivity = annual_erosivity(self.weather.annual_rain_mm)
            self._soil_loss_unit = (
                _number("usle_metric")
                * self.erosivity
                * float(erodibility)
                * slope_factor(float(slope), length)
            )
            self.gaps.append({"code": "soil_loss_uncalibrated", "slopeLengthAssumedM": length})
        share = self.weather.erosive_share(_number("erosive_rain_mm"))
        running = [0.0]
        for week in range(self.horizon + 1):
            day = self.day(week)
            running.append(running[-1] + share[min((day - date(day.year, 1, 1)).days // 7, 51)])
        self._erosive = running

    def soil_loss(self, first_week: int, end_week: int, cover_factor: float) -> float:
        """Tonnes of soil per hectare lost from `first_week` up to `end_week`."""
        if self._soil_loss_unit is None:
            return 0.0
        end = min(end_week, self.horizon)
        share = self._erosive[end] - self._erosive[min(first_week, end)]
        return self._soil_loss_unit * share * cover_factor

    def tillage_factor(self, crop: str, tillage: str) -> float:
        if tillage == "strip_till":
            return _number(f"usle_tillage_strip_till_{'drilled' if crop in DRILLED else 'row'}")
        return _number(f"usle_tillage_{tillage}")

    def _crop_factor(self, crop: str | None) -> float:
        """USLE crop type factor; a crop that is not planned here gets its class's."""
        row = self.factors.get(crop)
        if row:
            return row["usle"]
        known = self.model.advisor.catalog.crops.get(crop)
        sod = known is not None and known.value("lifecycle") == "perennial"
        return _number("usle_crop_factor_hay_pasture" if sod else "usle_crop_factor_unlisted")

    # -- one crop in one week ---------------------------------------------------------------

    def day(self, week: int) -> date:
        return self.start + timedelta(weeks=week)

    def _usual(self, pheno: Phenology, day: date) -> tuple[int, int]:
        """Days after the usual planting day nearest to `day`, and that crop's harvest year."""
        best = None
        for harvest_year in (day.year - 1, day.year, day.year + 1):
            usual = date(harvest_year, 1, 1) + timedelta(days=pheno.plant_doy - 1)
            offset = (day - usual).days
            if best is None or abs(offset) < abs(best[0]):
                best = (offset, harvest_year)
        return best

    def cycle(self, crop: str, week: int, established: bool = False) -> Cycle | None:
        key = (crop, week, established)
        if key not in self._cycles:
            pheno = self.phenology.get(crop)
            if pheno is None:
                found = None
            elif pheno.method == "season":
                found = self._perennial(pheno, week, established)
            else:
                found = self._annual(pheno, week)
            self._cycles[key] = found
        return self._cycles[key]

    def _window(self, pheno: Phenology, offset: int) -> float | None:
        """Yield against the usual planting day, or None when the date is not offered."""
        response = self.responses.get(pheno.crop)
        if offset < -self._early:
            return None
        if response is None:
            late = self._late.get(pheno.crop, int(_number("plant_late_days_without_response")))
            return 1.0 if offset <= late else None
        return response.relative(offset)

    def mature(self, pheno: Phenology, position: int) -> tuple[int, float] | None:
        """(day index of maturity, share of the needed heat reached) for a planting on
        `position`; an autumn frost ends a warm-season crop early. None past the weather record."""
        weather = self.weather
        limit = weather.run_end(position)
        if pheno.method == "heat":
            heat = weather.heat(pheno.base_c, pheno.cap_c)
            ripe = bisect_left(heat, heat[position] + pheno.heat, lo=position, hi=limit + 1)
        else:
            ripe = position + pheno.days
        if pheno.base_c >= 10:
            autumn = weather.first[weather.year_at(position)] + self._frost_from
            frost = weather.next_frost(max(position, autumn), self._frost_c)
            if frost < min(ripe, limit):
                if pheno.method == "heat":
                    reached = (heat[frost] - heat[position]) / pheno.heat
                else:
                    reached = (frost - position) / pheno.days
                return frost, max(0.0, min(1.0, reached))
        if ripe + pheno.harvest_lag >= limit:
            return None
        return ripe, 1.0

    def _annual(self, pheno: Phenology, week: int) -> Cycle | None:
        day = self.day(week)
        offset, harvest_year = self._usual(pheno, day)
        relative = self._window(pheno, offset)
        before = harvest_year - day.year  # 1 when the crop is planted the autumn before
        if relative is None or before not in (0, 1):
            return None
        gain, penalty = self.terms[pheno.crop]
        runs = []  # (days to harvest, share of heat reached, gain, weather penalty, need, rain)
        kc = self.factors.get(pheno.crop, {}).get("kc")
        for index, year in enumerate(self.model.years):
            position = self.weather.position(year.year - before, day)
            ripe = None if position is None else self.mature(pheno, position)
            if ripe is None:
                continue
            maturity, reached = ripe
            need = self._water_need(kc, position, maturity) if kc else None
            rain = self.weather.rain_between(position, maturity)
            runs.append(
                (maturity + pheno.harvest_lag - position, reached, gain[index], penalty[index],
                 need, rain)
            )  # fmt: skip
        if not runs:
            return None
        matured = sum(r[1] >= 1.0 for r in runs) / len(runs)
        if matured < self._required:
            return None
        groups: dict[int, list] = {}
        for run in runs:
            groups.setdefault(week + run[0] // 7 + 1, []).append(run)
        branches = tuple(
            Branch(
                free_week=free,
                odds=len(found) / len(runs),
                gain=relative * sum(r[1] * r[2] for r in found) / len(found),
                weather=sum(r[3] for r in found) / len(found),
            )
            for free, found in sorted(groups.items())
        )
        water, short = None, 0.0
        if kc:
            stored = float(self.model.context.soil.get("aws_100cm_mm") or 0.0)
            lacks = [max(0.0, r[4] - r[5] - stored) for r in runs]
            water = (
                sum(r[4] for r in runs) / len(runs),
                sum(r[5] for r in runs) / len(runs),
                sum(lacks) / len(runs),
            )
            short = sum(lack > 0 for lack in lacks) / len(runs)
        return Cycle(
            crop=pheno.crop,
            week=week,
            days_from_usual=offset,
            relative=relative,
            reached=sum(r[1] for r in runs) / len(runs),
            matured=matured,
            branches=branches,
            harvest_days=tuple(sorted(r[0] for r in runs)),
            water=water,
            short=short,
        )

    def _water_need(self, kc: tuple, start: int, end: int) -> float:
        """Crop evapotranspiration from planting to maturity (FAO-56 single coefficient)."""
        ini, mid, late = kc
        marks = [start]
        for share in self._stages:
            marks.append(marks[-1] + share * (end - start))
        cuts = [start, *(round(m) for m in marks[1:-1]), end]
        factors = (ini, (ini + mid) / 2, mid, (mid + late) / 2)
        return sum(
            factor * self.weather.eto_between(a, b) for factor, a, b in zip(factors, cuts, cuts[1:])
        )

    def _perennial(self, pheno: Phenology, week: int, established: bool) -> Cycle | None:
        day = self.day(week)
        offset, _ = self._usual(pheno, day)
        end_this_year = date(day.year, 1, 1) + timedelta(days=self._season_end - 1)
        if established:
            # the stand is kept for one more season: decided between the last cutting and spring
            if not (day >= end_this_year or offset <= self._late[pheno.crop]):
                return None
            target = (
                end_this_year if day < end_this_year else end_this_year.replace(year=day.year + 1)
            )
            offset = 0
        else:
            if self._window(pheno, offset) is None or day >= end_this_year:
                return None
            target = end_this_year
        gain, penalty = self.terms[pheno.crop]
        days = (target - day).days
        branch = Branch(week + days // 7 + 1, 1.0, sum(gain) / len(gain), sum(penalty) / len(gain))
        return Cycle(pheno.crop, week, offset, 1.0, 1.0, 1.0, (branch,), (days,), None, 0.0)

    # -- moves ------------------------------------------------------------------------------

    def _plantable(self, history: tuple[str, ...]) -> list[Action]:
        if history not in self._actions:
            self._actions[history] = self.model.actions(State(0, history, None, None))
        return self._actions[history]

    def economics(self, history: tuple[str, ...], action: Action) -> tuple:
        """(yield factor, cost without the cover crop, rule points in USD, carbon inputs,
        yield per acre at the usual date)."""
        key = (history, action)
        if key not in self._economics:
            model = self.model
            scale, fixed = model.factors(history, action)
            cost = model._base_outcomes(history, action)[0].cost
            risk = -fixed - cost  # below zero where the rules count a benefit
            if action.cover != "none":
                cost -= self._cover_usd  # paid in the week the cover crop is seeded
            carbon = None
            if self.carbon_known:
                carbon = (
                    model.advisor.catalog.crops[action.crop],
                    model.expected_yield_t_ha(State(0, history, None, None), action),
                )
            per_acre = model.sampler.basis[action.crop].expected_yield * scale
            self._economics[key] = (scale, cost, risk, carbon, per_acre)
        return self._economics[key]

    def _carbon(self, history: tuple[str, ...], action: Action, yield_share: float) -> float:
        carbon = self.economics(history, action)[3]
        if carbon is None:
            return 0.0
        crop, yield_t_ha = carbon
        return self.model.soil_carbon.stable_input(
            crop, yield_t_ha * yield_share, action.cover, self.model.carbon_inputs
        )

    def _day_of_year(self, week: int) -> int:
        day = self.day(week)
        return (day - date(day.year, 1, 1)).days + 1

    def _idle(self, spot: Spot) -> float:
        """Soil lost in one week with no crop in the field."""
        factor = self._crop_factor(spot.history[-1] if spot.history else None) * spot.tilled
        if spot.cover:
            factor = min(factor, self._cover_factor)
        return self.soil_loss(spot.week, spot.week + 1, factor)

    def is_stand(self, history: tuple[str, ...], crop: str) -> bool:
        """The crop is a perennial that already stands in the field."""
        return bool(history) and history[-1] == crop and self.model._lifecycle[crop] == "perennial"

    def _plantings(self, spot: Spot):
        """(action, years without a harvest before it, history it is planted into, cycle)."""
        day = self.day(spot.week)
        wanted = "rye" if spot.cover else "none"
        base = max(0, day.year - spot.harvested - 1)
        for skipped in (base, base + 1):
            # a calendar year without a harvest enters the crop history as fallow
            history = spot.history
            for _ in range(skipped):
                history = shift(history, FALLOW)
            for action in self._plantable(history):
                if action.cover != wanted:
                    continue
                cycle = self.cycle(action.crop, spot.week, self.is_stand(history, action.crop))
                if cycle is None:
                    continue
                # a crop is planned only if its harvest of a middle year falls inside the plan
                middle = cycle.harvest_days[len(cycle.harvest_days) // 2]
                harvest = day + timedelta(days=middle)
                if spot.week + middle // 7 + 1 > self.horizon:
                    continue
                if max(0, harvest.year - spot.harvested - 1) == skipped:
                    yield action, skipped, history, cycle, harvest.year

    def moves(self, spot: Spot) -> list[tuple[Move, list[tuple[float, Spot, tuple]]]]:
        """Every move open in this week with its outcomes: (odds, next spot, terms)."""
        if spot in self._moves:
            return self._moves[spot]
        out = []
        for action, skipped, history, cycle, harvest_year in self._plantings(spot):
            scale, cost, risk, _, _ = self.economics(history, action)
            till = self.tillage_factor(action.crop, action.tillage)
            factor = self._crop_factor(action.crop) * till
            carbon = self._carbon(history, action, cycle.relative * cycle.reached)
            nitrogen = 0.0
            if history and not self.factors.get(action.crop, {}).get("nitrogen"):
                nitrogen = self.factors.get(history[-1], {}).get("nitrogen", 0.0)
            after = shift(history, action.crop)
            outcomes = [
                (
                    branch.odds,
                    Spot(branch.free_week, after, False, till, harvest_year),
                    _terms(
                        revenue=scale * branch.gain,
                        cost=cost,
                        risk=risk - branch.weather,
                        carbon=carbon,
                        erosion=self.soil_loss(spot.week, branch.free_week, factor),
                        deficit=cycle.water[2] if cycle.water else 0.0,
                        short=cycle.short,
                        nitrogen=nitrogen,
                        crops=1.0,
                    ),
                )
                for branch in cycle.branches
            ]
            out.append((Move("plant", action, cycle.days_from_usual, skipped), outcomes))
        day_of_year = self._day_of_year(spot.week)
        first, last, cleared = self._rye
        idle = self._idle(spot)
        if (
            not spot.cover
            and first <= day_of_year <= last
            and any(a.cover == "rye" for a in self._plantable(spot.history))
        ):
            seeded = replace(spot, week=spot.week + 1, cover=True)
            out.append(
                (Move("seed_cover"), [(1.0, seeded, _terms(cost=self._cover_usd, erosion=idle))])
            )
        next_day = self._day_of_year(spot.week + 1)
        keeps_cover = spot.cover and not cleared <= next_day < first
        waited = replace(spot, week=spot.week + 1, cover=keeps_cover)
        out.append((Move("wait"), [(1.0, waited, _terms(erosion=idle))]))
        self._moves[spot] = out
        return out

    @property
    def start_spot(self) -> Spot:
        # the last harvest is this year's once autumn has come, last year's before
        harvested = self.start.year if self.start.month >= 10 else self.start.year - 1
        return Spot(0, self.model.context.history, harvested=harvested)

    # -- solving and scoring ----------------------------------------------------------------

    def solve(self, preferences: Preferences = Preferences()) -> "Solution":
        """Best move in every reachable free week, by backward induction."""
        value: dict[Spot, float] = {}
        choice: dict[Spot, Move] = {}
        pending = [self.start_spot]
        while pending:  # explicit stack: a plan is hundreds of weeks deep
            spot = pending[-1]
            if spot in value:
                pending.pop()
                continue
            if spot.week >= self.horizon:
                value[spot] = 0.0
                pending.pop()
                continue
            options = self.moves(spot)
            missing = [nxt for _, outcomes in options for _, nxt, _ in outcomes if nxt not in value]
            if missing:
                pending.extend(missing)
                continue
            best, pick = -math.inf, None
            for move, outcomes in options:
                total = sum(
                    odds * (preferences.score(terms) + value[nxt]) for odds, nxt, terms in outcomes
                ) - TIE_USD_PER_DAY * abs(move.days_from_usual)
                if total > best + 1e-9:
                    best, pick = total, move
            value[spot], choice[spot] = best, pick
            pending.pop()
        return Solution(self, preferences, value, lambda spot, planted: choice[spot])

    def current_rotation(self) -> "Solution | None":
        """The field's own rotation, repeated, with full tillage and no cover crop.

        Each crop goes in on the week nearest its usual planting day, or on the first free week
        after it while the planting-date trials still keep `rotation_min_relative_yield` of the
        yield; later than that it waits for the crop's next season. A fallow year of the rotation
        is kept. None when the rotation has a crop that is not planned here.
        """
        history = self.model.context.history
        period = rotation_period(history)
        cycle = history[len(history) - period :]
        crops = [crop for crop in cycle if crop != FALLOW]
        if not crops or any(crop not in self.model.crops for crop in crops):
            return None
        fallows, pending = [], 0  # fallow years the rotation has before each of its crops
        for crop in cycle:
            if crop == FALLOW:
                pending += 1
            else:
                fallows.append(pending)
                pending = 0
        fallows[0] += pending
        least = _number("rotation_min_relative_yield")

        def policy(spot: Spot, planted: int) -> Move:
            target, rest = crops[planted % len(crops)], fallows[planted % len(crops)]
            options = [move for move, _ in self.moves(spot)]
            for move in options:
                if move.kind != "plant" or move.action.crop != target or move.skipped < rest:
                    continue
                # a standing perennial is kept without tillage; everything else is fully tilled
                kept = move.skipped == 0 and self.is_stand(spot.history, target)
                tillage = self.gentlest if kept else self.conventional
                if move.action != Action(target, tillage, "none") or move.days_from_usual < -3:
                    continue
                if self.cycle(target, spot.week, kept).relative >= least:
                    return move
            return next(move for move in options if move.kind == "wait")

        return Solution(self, Preferences(), None, policy)


def rotation_period(history: tuple[str, ...]) -> int:
    """Length of the shortest cycle the crop history repeats."""
    return next(
        (
            p
            for p in range(1, len(history))
            if all(history[i] == history[i - p] for i in range(p, len(history)))
        ),
        len(history),
    )


@dataclass
class Solution:
    planner: WeeklyPlanner
    preferences: Preferences
    value: dict | None  # value of every reachable spot, from `solve`
    choice: object  # (spot, crops planted so far) -> move

    def _outcomes(self, spot: Spot, move: Move) -> list:
        return next(o for m, o in self.planner.moves(spot) if m == move)

    def expected(self) -> tuple:
        """Expected terms over the whole plan, per acre (carbon and soil loss per hectare)."""
        planner = self.planner
        mass: dict[int, dict[tuple[Spot, int], float]] = {0: {(planner.start_spot, 0): 1.0}}
        total = ZERO
        for week in range(planner.horizon):
            for (spot, planted), odds in mass.pop(week, {}).items():
                move = self.choice(spot, planted)
                after = planted + (move.kind == "plant")
                for share, nxt, terms in self._outcomes(spot, move):
                    total = _add(total, terms, odds * share)
                    slot = mass.setdefault(nxt.week, {})
                    slot[(nxt, after)] = slot.get((nxt, after), 0.0) + odds * share
        return total

    def steps(self, alternatives: int = 0) -> list[dict]:
        """The plan along the most likely harvest dates."""
        planner, model = self.planner, self.planner.model
        spot, planted, out = planner.start_spot, 0, []
        while spot.week < planner.horizon:
            move = self.choice(spot, planted)
            outcomes = self._outcomes(spot, move)
            today = planner.day(spot.week)
            if move.kind == "seed_cover":
                out.append({"coverCrop": "rye", "seed": today.isoformat()})
            elif move.kind == "plant":
                planted += 1
                action = move.action
                history = spot.history
                for _ in range(move.skipped):
                    history = shift(history, FALLOW)
                kept = planner.is_stand(history, action.crop)
                cycle = planner.cycle(action.crop, spot.week, kept)
                per_acre = planner.economics(history, action)[4]
                days = cycle.harvest_days
                step = {
                    "crop": action.crop,
                    "tillage": action.tillage,
                    "coverCropBefore": action.cover,
                    "standKept": kept,
                    "plant": None if kept else today.isoformat(),
                    "daysFromUsualPlanting": cycle.days_from_usual,
                    "yieldAgainstUsualDate": round(cycle.relative, 3),
                    "harvest": {
                        name: (
                            today + timedelta(days=days[round(share * (len(days) - 1))])
                        ).isoformat()
                        for name, share in (("early", 0.1), ("likely", 0.5), ("late", 0.9))
                    },
                    "expectedYieldPerAcre": round(per_acre * cycle.relative * cycle.reached, 1),
                    "yieldUnit": model.sampler.basis[action.crop].unit + "/acre",
                    "expectedNetUsdPerAcre": round(
                        sum(o * (t[0] - t[1] - t[2]) for o, _, t in outcomes), 2
                    ),
                    "yearsMaturedBeforeFrost": round(cycle.matured, 2),
                    "yearsWithoutHarvestBefore": move.skipped,
                }
                if kept:
                    step["decided"] = today.isoformat()
                if cycle.water:
                    step["water"] = {
                        "cropNeedMm": round(cycle.water[0]),
                        "rainMm": round(cycle.water[1]),
                        "shortfallMm": round(cycle.water[2]),
                        "yearsShort": round(cycle.short, 2),
                    }
                if alternatives and self.value is not None:
                    step["alternatives"] = self._alternatives(spot, move, alternatives)
                out.append(step)
            spot = max(outcomes, key=lambda o: o[0])[1]
        return out

    def _alternatives(self, spot: Spot, chosen: Move, count: int) -> list[dict]:
        scores = []
        for move, outcomes in self.planner.moves(spot):
            if move == chosen:
                continue
            total = sum(
                odds * (self.preferences.score(terms) + self.value[nxt])
                for odds, nxt, terms in outcomes
            )
            scores.append((total, move))
        best = self.value[spot] + TIE_USD_PER_DAY * abs(chosen.days_from_usual)
        scores.sort(key=lambda s: -s[0])
        return [
            {"instead": move.label(), "costsUsdPerAcre": round(best - total, 2)}
            for total, move in scores[:count]
        ]


SOIL_LOSS_CLASSES = (
    (6.7, "very low (tolerable)"),
    (11.2, "low"),
    (22.4, "moderate"),
    (33.6, "high"),
)


def soil_loss_class(t_per_ha_year: float) -> str:
    """OMAFRA factsheet 23-005, Table 7."""
    for limit, name in SOIL_LOSS_CLASSES:
        if t_per_ha_year < limit:
            return name
    return "severe"


def score_card(solution: Solution, judged_by: Preferences) -> dict:
    """One strategy on every term, per year of the plan."""
    planner = solution.planner
    terms = dict(zip(TERMS, solution.expected()))
    years = planner.horizon / 52
    carbon = terms["carbon"] - planner.carbon_loss_per_week * planner.horizon
    known = planner.erosivity is not None
    crops = terms["crops"]
    return {
        "cashUsdPerAcreYear": round((terms["revenue"] - terms["cost"]) / years, 2),
        "rulesAndWeatherPenaltyUsdPerAcreYear": round(terms["risk"] / years, 2),
        "soilCarbonChangeTPerHaYear": round(carbon / years, 3) if planner.carbon_known else None,
        "soilLossTPerHaYear": round(terms["erosion"] / years, 2) if known else None,
        "soilLossClass": soil_loss_class(terms["erosion"] / years) if known else None,
        "waterShortfallMmPerCrop": round(terms["deficit"] / crops, 1) if crops else None,
        "cropsShortOfWaterShare": round(terms["short"] / crops, 2) if crops else None,
        "nitrogenLeftByLegumesKgPerHaYear": round(terms["nitrogen"] / years, 1),
        "cropsPerYear": round(crops / years, 2),
        "scoreUsdPerAcreYear": round(judged_by.score(tuple(terms.values())) / years, 2),
    }


def _sequence(steps: list[dict]) -> list[str]:
    return [
        f"{s['plant'] or s['decided']} {s['crop']}/{s['tillage']}"
        if "crop" in s
        else f"{s['seed']} rye cover"
        for s in steps
    ]


def weekly_plan(planner: WeeklyPlanner, preferences: Preferences = Preferences()) -> dict:
    """The recommended plan and the strategies it is compared with."""
    model, weather = planner.model, planner.weather
    gaps = list(planner.gaps)
    cash = Preferences(0.0, 0.0)
    heavy = Preferences(4 * preferences.soil_usd_per_t_c, 4 * preferences.erosion_usd_per_t)
    balanced = planner.solve(preferences)
    strategies = [
        ("balanced", "money plus soil at the given prices", balanced, preferences),
        ("cash_first", "money only", planner.solve(cash), cash),
        ("soil_first", "soil priced four times higher", planner.solve(heavy), heavy),
    ]
    current = planner.current_rotation()
    if current is not None:
        meaning = "the field's own rotation, full tillage, no cover crop"
        strategies.insert(0, ("current_rotation", meaning, current, None))
    else:
        gaps.append({"code": "current_rotation_not_scored_crop_not_planned"})
    compared = [
        {
            "strategy": name,
            "meaning": meaning,
            "priced": own
            and {
                "soilUsdPerTCarbon": own.soil_usd_per_t_c,
                "erosionUsdPerTSoil": own.erosion_usd_per_t,
            },
            "perYear": score_card(solution, preferences),
            "sequence": _sequence(solution.steps()),
        }
        for name, meaning, solution, own in strategies
    ]
    return {
        "fieldId": str(model.context.field.get("id")),
        "region": model.context.region,
        "start": planner.start.isoformat(),
        "weeks": planner.horizon,
        "history": list(model.context.history),
        "historySource": model.context.history_source,
        "crops": list(model.crops),
        "units": "USD per acre and year, land cost excluded; soil carbon and soil loss per hectare",
        "weather": {
            "years": [weather.years[0], weather.years[-1]],
            "replayedInClimateOf": weather.target_year,
            "warmingCPerDecade": round(10 * weather.trend_c_per_year, 2),
            "meanAnnualRainMm": round(weather.annual_rain_mm),
            "erosivityUs": None if planner.erosivity is None else round(planner.erosivity, 1),
        },
        "plan": balanced.steps(alternatives=3),
        "strategies": compared,
        "dataGaps": gaps,
    }


def assume_recent_crops(context: FieldContext, catalog, start: date) -> FieldContext:
    """Bring the crop history up to the start date.

    The satellite history ends a year or more before the plan starts: the seasons after its last
    year are filled with the field's own rotation. A year the satellite did map, but to a crop
    this catalog does not have, is not guessed: it is reported and left out.
    """
    history = context.history
    if not history or context.last_history_year is None:
        return context
    seasons = [context.seasons[year] for year in sorted(context.seasons)]
    known = crop_history(context.field, seasons, catalog)
    unknown = [y.year for y in known if y.crop is None and y.year > context.last_history_year]
    finished = start.year if start.month >= 10 else start.year - 1
    period = rotation_period(history)
    assumed = {}
    for year in range(max(y.year for y in known) + 1, finished + 1):
        assumed[year] = history[-period]
        history = shift(history, assumed[year])
    gaps = list(context.gaps)
    if unknown:
        gaps.append({"code": "recent_crops_not_in_catalog", "years": unknown})
    if assumed:
        gaps.append({"code": "recent_crops_assumed_from_the_rotation", "crops": assumed})
    return replace(context, history=history, gaps=tuple(gaps))


def main() -> None:
    from rule_engine import build_advisor
    from rule_engine.planner import build_context, read_fields, state_reference_aws
    from rule_engine.planner.prices import PLAN_YEAR

    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--field", required=True)
    parser.add_argument(
        "--plan-year",
        type=int,
        default=PLAN_YEAR,
        help="first planted year; only what was known in the autumn before it is used (0: everything)",
    )
    parser.add_argument("--fields", required=True, help="fields.jsonl (engine field records)")
    parser.add_argument("--summaries", nargs="*", default=[], help="season summary roots")
    parser.add_argument("--gridmet", required=True, help="folder of yearly gridMET parquet files")
    parser.add_argument("--start", type=date.fromisoformat, default=date.today())
    parser.add_argument("--years", type=float, default=3.0)
    parser.add_argument("--crops", nargs="*")
    parser.add_argument("--grown", nargs="*", default=[], metavar="CROP",
                        help="crops grown since the satellite history ended, oldest first")  # fmt: skip
    parser.add_argument("--soil-usd-per-t-c", type=float, default=Preferences.soil_usd_per_t_c)
    parser.add_argument("--erosion-usd-per-t", type=float, default=Preferences.erosion_usd_per_t)
    parser.add_argument("--slope-length-m", type=float)
    parser.add_argument("--keep-climate", action="store_true",
                        help="replay the past seasons as they were, without the warming trend")  # fmt: skip
    args = parser.parse_args()

    advisor = build_advisor()
    fields = read_fields(args.fields)
    record = fields[args.field]
    reference = state_reference_aws(fields).get(record.get("stateFips"))
    context = build_context(
        record, advisor, args.summaries, reference, plan_year=args.plan_year or None
    )
    if args.grown:
        history = context.history
        for crop in args.grown:
            history = shift(history, crop)
        context = replace(context, history=history, history_source="declared")
    else:
        context = assume_recent_crops(context, advisor.catalog, args.start)
    model = RotationModel(context, advisor, crops=tuple(args.crops) if args.crops else None)
    weather = DailyWeather.from_gridmet(
        record.get("sourceId") or record["id"],
        args.gridmet,
        None if args.keep_climate else args.start.year,
    )
    planner = WeeklyPlanner(
        model, weather, args.start, round(args.years * 52), slope_length_m=args.slope_length_m
    )
    preferences = Preferences(args.soil_usd_per_t_c, args.erosion_usd_per_t)
    print(json.dumps(weekly_plan(planner, preferences), indent=2))


if __name__ == "__main__":
    main()
