"""Historical years as the source of randomness.

One draw is one whole historical year: its weather at the field, its yields and its prices
together, so their real co-movement (a drought year has low yield and a high price) is kept.

Yield of a crop in a drawn year, per acre in the crop's own unit:

    expected yield now  x  that year's anomaly

- anomaly "observed": the year's yield divided by the linear trend. County yields for corn and
  soybeans (USDA NASS, from the season summary), state yields for the other crops. An observed
  yield already contains that year's weather, so no hazard loss is applied on top of it.
- anomaly "modelled": used when the year has no observed yield. The product of the published
  losses in data/weather_yield_response.csv for the hazards that occurred in that season.
- anomaly "none": no observed yield and no response row; the expected yield is used as is.

Prices: a drawn year's price is the expected price times that year's deviation of the
marketing-year price from its log-linear trend in constant dollars (CPI-U, data/cpi_u.csv), so
the 1980s are not drawn as high-price years just for being early. With a plan year
(FieldContext.plan_year) the expected price is what was known in the autumn before it
(prices.py): the USDA baseline, moved by the latest WASDE, where USDA projects the crop, else a
persistence forecast from the September price; only marketing years through plan_year - 2 are
used. Without one, or without either, the rule engine's planning price is the expected price.

A yield series with fewer than 3 observations in the 10 years before the planned season has ended
(NASS stopped publishing Iowa sorghum after 1984, and many southern county corn and soybean
yields in the 1990s) and is not used: the crop then takes the next level (state series, then the
reference yield), and without one it is not planned (gap `no_yield`). A trend is fitted to 10 or
more observations; with fewer, the level is the mean of the recent ones.

Prices and state yields come from planner/data/nass_long_history.csv (since 1980, every state)
where it has the series, otherwise from the rule engine's nass_reference_history.csv.

Irrigation (planner/irrigation.py): the drawn yields are all-practice yields. On a field the
irrigation maps show as irrigated or dryland they are scaled by the state's ratio of that
practice's yield to the all-practice yield (that year's ratio for an observed year, the mean
ratio for the expected yield), where NASS publishes the split. An irrigated field takes no
modelled drought loss: water is not what limits it.
"""

import csv
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from random import Random

from rule_engine.engine import RotationAdvisor
from rule_engine.planner.adapter import RuleAdapter, WeatherPart
from rule_engine.planner.context import FieldContext
from rule_engine.planner.irrigation import practice_ratios
from rule_engine.planner.prices import (
    OUTLOOK_SERIES,
    deviations,
    expected_us_price,
    harvest_levels,
    known,
    persistence,
    state_ratio,
)
from rule_engine.planner.tables import (
    NEEDS_IRRIGATION,
    Response,
    byproduct_share,
    ers_region,
    load_responses,
    rule_data,
    unit_kind,
)

LONG_HISTORY_CSV = Path(__file__).parent / "data" / "nass_long_history.csv"
CPI_CSV = Path(__file__).parent / "data" / "cpi_u.csv"  # BLS CPI-U, all items, 1982-84 = 100
COUNTY_COLUMNS = {"corn": "yield_corn_bu_ac", "soybeans": "yield_soy_bu_ac"}
MIN_TREND_POINTS = 10
# NASS stopped publishing some yields (Iowa sorghum after 1984; county corn and soybeans across
# much of the South in the 1990s). A series with fewer than MIN_RECENT_YIELDS observations in the
# RECENT_YIELD_YEARS before the planned season is not today's yield level, and its trend is not
# extended to now.
RECENT_YIELD_YEARS = 10
MIN_RECENT_YIELDS = 3


@dataclass(frozen=True)
class CropYear:
    yield_per_acre: float
    price: float  # USD per yield unit
    mode: str  # observed | modelled | none
    anomaly: float
    modelled_factor: float  # what the response table gives for this season (1.0 = no loss)
    drought_loss: float  # the drought share of the modelled loss, for the soil water modifier
    paid_rules: tuple[str, ...]  # hazard rules whose effect is carried by the yield
    weather: WeatherPart | None


@dataclass(frozen=True)
class Year:
    year: int
    crops: dict[str, CropYear]


@dataclass(frozen=True)
class CropBasis:
    unit: str  # bu | ton | lb | cwt (per acre)
    expected_yield: float
    yield_level: str  # county | state | reference
    yield_verified: bool
    price: float
    price_level: str
    price_years: int
    observed_years: int
    notes: tuple[str, ...] = field(default=())
    practice: str = "all"  # all | irrigated | dryland: the practice the yields are scaled to
    price_source: str = ""  # how the expected price was set (prices.Expected.detail)
    # {year: detrended real September price}, known before the plan: the price signal of the
    # year just experienced (chance.py)
    harvest_levels: dict = field(default_factory=dict, hash=False, compare=False)


def _current(observed: dict[int, float], planned: int) -> dict[int, float]:
    """The part of a yield series that says what the crop yields now; {} when the series ended.

    With too few points for a trend only the recent ones are kept, so the level is their mean
    and an old yield is not read as a bad year against it.
    """
    recent = {y: v for y, v in observed.items() if planned - y <= RECENT_YIELD_YEARS}
    if len(recent) < MIN_RECENT_YIELDS:
        return {}
    return observed if len(observed) >= MIN_TREND_POINTS else recent


def _trend(points: dict[int, float]):
    """Least-squares line through (year, value); a flat mean when there are too few points."""
    years = sorted(points)
    mean_y = sum(points.values()) / len(points)
    if len(years) < MIN_TREND_POINTS:
        return lambda year: mean_y
    mean_x = sum(years) / len(years)
    sxx = sum((x - mean_x) ** 2 for x in years)
    slope = sum((x - mean_x) * (points[x] - mean_y) for x in years) / sxx
    return lambda year: mean_y + slope * (year - mean_x)


@lru_cache(maxsize=1)
def _history_rows() -> tuple[dict, ...]:
    """Long-history rows first, so `_series` finds them before the engine's shorter series."""
    rows: list[dict] = []
    for path in (LONG_HISTORY_CSV, rule_data() / "nass_reference_history.csv"):
        if path.exists():
            with path.open(newline="") as handle:
                rows += list(csv.DictReader(handle))
    return tuple(rows)


@lru_cache(maxsize=1)
def _cpi() -> dict[int, float]:
    with CPI_CSV.open(newline="") as handle:
        return {int(row["year"]): float(row["cpi_u"]) for row in csv.DictReader(handle)}


def price_levels(history: dict[int, float]) -> dict[int, float]:
    """{year: real price / its log-linear trend}. Years without a CPI value are left out."""
    return deviations(history)


@lru_cache(maxsize=8)
def _persistence(plan_year: int | None) -> float:
    """Price persistence over the US series of the crops USDA projects, known before the plan."""
    rows = _history_rows()
    series = [
        known(_series(rows, "price", crop, "US")[0], plan_year)
        for crop in OUTLOOK_SERIES
        if OUTLOOK_SERIES[crop] == crop
    ]
    return persistence([s for s in series if s])


def _series(rows, kind: str, crop: str, region: str) -> tuple[dict[int, float], str, str]:
    """({year: value}, unit, geography) preferring the field's state, then national, then Iowa.

    A price series that covers under 80 % of the years of the longest candidate is passed over
    (NASS stopped reporting some state prices), so the drawn years keep a price.
    """
    candidates = []
    for geography in (region, "US", "IA"):
        match = [
            r
            for r in rows
            if r["kind"] == kind and r["crop"] == crop and r["geography"] == geography
        ]
        if not match:
            continue
        first = match[0]  # one series per geography: the first file that has it defines it
        values = {
            int(r["year"]): float(r["value"])
            for r in match
            if r["unit"] == first["unit"]
            and r.get("nass_short_desc") == first.get("nass_short_desc")
        }
        candidates.append((values, first["unit"], geography))
    if not candidates:
        return {}, "", ""
    if kind == "price":
        longest = max(len(values) for values, _, _ in candidates)
        candidates = [c for c in candidates if len(c[0]) >= 0.8 * longest]
    return candidates[0]


def modelled_loss(crop: str, weather: WeatherPart, responses: list[Response]):
    """(yield factor, drought part of the loss, engine rules paid for by the yield)."""
    factor, drought, paid = 1.0, 0.0, set()
    evaluated = set(weather.evaluated)
    hits = {hit.rule: hit for hit in weather.hazards}
    weekly = {"per_drought_week": weather.drought_weeks, "per_d4_week": weather.d4_weeks}
    drought_total, drought_cap = 0.0, 1.0
    for row in responses:
        if row.applies_to != crop:
            continue
        if row.kind in weekly:
            weeks = weekly[row.kind]
            if weeks is None:
                continue
            paid.add(row.rule)
            drought_total += weeks * row.loss
            drought_cap = min(drought_cap, row.cap)
            continue
        if row.rule not in evaluated:
            continue
        paid.add(row.rule)
        hit = hits.get(row.rule)
        if hit is None:
            continue
        loss = row.loss if row.kind == "per_hit" else row.loss * hit.value
        factor *= 1.0 - min(row.cap, loss)
    drought = min(drought_cap, drought_total)
    return factor * (1.0 - drought), drought, tuple(sorted(paid))


class YearSampler:
    def __init__(
        self,
        context: FieldContext,
        advisor: RotationAdvisor,
        adapter: RuleAdapter,
        crops: list[str],
        responses: list[Response] | None = None,
    ):
        self.context = context
        self.responses = responses if responses is not None else load_responses()
        rows = _history_rows()
        seasons = context.seasons
        plan_year = context.plan_year
        trend_year = context.trend_year or plan_year
        # the September prices known before the plan: through plan_year - 1, or through the
        # last season without a plan year (so the price signal has no year beyond the draws)
        harvest_cutoff = plan_year if plan_year is not None else max(seasons, default=0) + 1
        status = context.irrigation_status
        self.irrigated = status == "irrigated"
        self.basis: dict[str, CropBasis] = {}
        self.unavailable: dict[str, str] = {}
        prices: dict[str, dict[int, float]] = {}
        anomalies: dict[str, dict[int, float]] = {}
        planned = trend_year or max(seasons or (int(r["year"]) for r in rows)) + 1
        for crop_id in crops:
            quote = advisor.reference.price(crop_id, context.region)
            if quote is None:
                self.unavailable[crop_id] = "no_price"
                continue
            unit = unit_kind(quote.unit)
            notes = []
            unit_price = quote.price_usd
            byproduct = byproduct_share(crop_id, ers_region(context.field.get("countyFips")))
            if byproduct:  # cottonseed: in the ERS gross value, and it pays for the ginning
                unit_price *= 1.0 + byproduct[1]
                notes.append(f"{byproduct[0]}_in_price")

            observed: dict[int, float] = {}
            level = "reference"
            ended = False
            column = COUNTY_COLUMNS.get(crop_id)
            if column:
                published = {
                    y: float(s.scalars[column])
                    for y, s in seasons.items()
                    if (s.scalars.get(column) or 0) > 0  # NASS zero is "not reported", not a yield
                }
                observed, level = _current(published, planned), "county"
                ended = bool(published) and not observed
            if not observed:
                published, y_unit, geography = _series(rows, "yield", crop_id, context.region)
                if geography != context.region or unit_kind(y_unit) != unit:
                    published = {}  # another state's yield level is not this field's
                if plan_year is not None:  # final yields of the seasons before the plan
                    published = {y: v for y, v in published.items() if y < plan_year}
                observed, level = _current(published, planned), "state"
                ended = ended or (bool(published) and not observed)
            if ended:
                notes.append("yield_history_ended")
            verified = True
            if observed:
                trend = _trend(observed)
                last = max(observed)
                # the trend carried at most two years past the last observed yield
                expected = trend(min(trend_year, last + 2) if trend_year else last)
                anomalies[crop_id] = {y: v / trend(y) for y, v in observed.items() if trend(y) > 0}
            else:
                ref = advisor.reference.yield_reference(crop_id, context.region)
                if ref is None or unit_kind(ref.unit) != unit:
                    self.unavailable[crop_id] = "no_yield"
                    continue
                expected, level, verified = ref.mid, "reference", ref.verified
                notes.append("no_yield_history")
                anomalies[crop_id] = {}

            practice, ratios = "all", {}
            split = practice_ratios(crop_id, context.region, status)
            if split is not None:
                ratios, mean_ratio = split
                practice = status
                expected *= mean_ratio
                anomalies[crop_id] = {
                    y: a * ratios.get(y, mean_ratio) / mean_ratio
                    for y, a in anomalies[crop_id].items()
                }
            elif status in ("irrigated", "dryland") and crop_id not in NEEDS_IRRIGATION:
                notes.append("no_practice_yield_split")  # rice: every acre is irrigated

            history, p_unit, geography = _series(rows, "price", crop_id, context.region)
            history = known(history, plan_year)
            price_source = f"rule engine planning price ({quote.level})"
            price_level = quote.level
            if history and p_unit.split("/")[-1].strip().lower() == unit:
                if plan_year is not None:
                    us, us_unit, us_geography = _series(rows, "price", crop_id, "US")
                    if us and us_unit == p_unit and us_geography == "US":
                        outlook = expected_us_price(crop_id, plan_year, us, _persistence(plan_year))
                        if outlook is not None:
                            ratio = (
                                state_ratio(history, us, plan_year) if geography != "US" else 1.0
                            )
                            unit_price = outlook.price * ratio * (1.0 + (byproduct or (0, 0))[1])
                            price_source = outlook.detail + (
                                f", x {geography}/US {ratio:.2f}" if ratio != 1.0 else ""
                            )
                            price_level = outlook.method
                prices[crop_id] = {
                    y: level * unit_price for y, level in price_levels(history).items()
                }
                if geography != context.region:
                    notes.append(f"price_history_from_{geography}")
            else:
                prices[crop_id] = {}
                notes.append("no_price_history")
            self.basis[crop_id] = CropBasis(
                unit=unit,
                expected_yield=expected,
                yield_level=level,
                yield_verified=verified,
                price=unit_price,
                price_level=price_level,
                price_years=len(prices[crop_id]),
                observed_years=len(anomalies[crop_id]),
                notes=tuple(notes),
                practice=practice,
                price_source=price_source,
                harvest_levels=harvest_levels(crop_id, harvest_cutoff),
            )

        # Years that can be drawn: those with weather at the field. Without any season summary
        # the price years are drawn instead (yields then vary only where a state series exists).
        draw_years = sorted(seasons) or sorted({y for p in prices.values() for y in p})
        self.years: list[Year] = []
        for year in draw_years:
            season = seasons.get(year)
            crops_out = {}
            for crop_id, basis in self.basis.items():
                weather = adapter.weather_part(crop_id, season) if season else None
                factor, drought, paid = (1.0, 0.0, ())
                if weather is not None:
                    factor, drought, paid = modelled_loss(crop_id, weather, self.responses)
                    if self.irrigated and drought:
                        factor, drought = factor / (1.0 - drought), 0.0
                anomaly = anomalies[crop_id].get(year)
                if anomaly is not None:
                    mode = "observed"
                    paid = weather.evaluated if weather else ()
                    if self.irrigated:
                        drought = 0.0
                elif paid:
                    mode, anomaly = "modelled", factor
                else:
                    mode, anomaly = "none", 1.0
                crops_out[crop_id] = CropYear(
                    yield_per_acre=basis.expected_yield * anomaly,
                    price=prices[crop_id].get(year, basis.price),
                    mode=mode,
                    anomaly=anomaly,
                    modelled_factor=factor,
                    drought_loss=drought,
                    paid_rules=tuple(paid),
                    weather=weather,
                )
            self.years.append(Year(year, crops_out))

    def draw(self, rng: Random) -> Year:
        return rng.choice(self.years)
