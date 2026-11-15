"""What a farmer can know about crop prices when planning a season, and nothing later.

Planning happens in the autumn before the planted year P (the plan starts after harvest of
P-1). At that point:

- marketing-year prices are final up to P-2 only. A marketing year ends months after harvest
  (August of the next year for corn and soybeans), so the P-1 price is not known yet;
- the September price received of P-1 is (NASS Agricultural Prices, published at the end of
  September; data/harvest_prices.csv);
- the outlooks published before then are: the USDA November WASDE for P-1 and the USDA
  long-term baseline for P and later (data/price_outlook.csv).

Prices are compared in constant dollars (CPI-U) around a log-linear trend: real crop prices
have fallen since the 1980s, so a year's price draw is its deviation from the trend, and the
level comes from the outlook. Without an outlook the expected price is a first-order
autoregressive forecast of the detrended log price, with the persistence measured on the
history (`persistence`).
"""

import csv
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parent / "data"
HARVEST_CSV = DATA / "harvest_prices.csv"
OUTLOOK_CSV = DATA / "price_outlook.csv"
CPI_CSV = DATA / "cpi_u.csv"
PLAN_YEAR = 2027  # the live plan: made after the 2026 harvest for the 2027 season
HARVEST_MONTH = "sep"
RATIO_YEARS = 5  # recent years of a state's price against the US price
MIN_POINTS = 8
# crops priced through another crop's outlook: (outlook series, the crop's own US price series)
OUTLOOK_SERIES = {
    "corn": "corn",
    "soybeans": "soybeans",
    "sorghum": "sorghum",
    "barley": "barley",
    "oats": "oats",
    "cotton": "cotton",
    "rice": "rice",
    "winter_wheat": "wheat",
    "spring_wheat": "wheat",
    "durum_wheat": "wheat",
}


@lru_cache(maxsize=1)
def cpi() -> dict[int, float]:
    with CPI_CSV.open(newline="") as handle:
        return {int(row["year"]): float(row["cpi_u"]) for row in csv.DictReader(handle)}


def log_trend(points: dict[int, float]):
    """Least-squares line through (year, log value); None with too few points."""
    years = [y for y, v in points.items() if v > 0]
    if len(years) < MIN_POINTS:
        return None
    logs = {y: math.log(points[y]) for y in years}
    mx = sum(years) / len(years)
    my = sum(logs.values()) / len(years)
    sxx = sum((x - mx) ** 2 for x in years)
    slope = sum((x - mx) * (logs[x] - my) for x in years) / sxx
    return lambda year: math.exp(my + slope * (year - mx))


def cpi_of(year: int) -> float | None:
    """CPI-U of the year; a year after the table uses its latest year (about 3 % a year off)."""
    table = cpi()
    return table.get(min(year, max(table)))


def real(history: dict[int, float]) -> dict[int, float]:
    return {y: p / c for y, p in history.items() if (c := cpi_of(y))}


def deviations(history: dict[int, float]) -> dict[int, float]:
    """{year: real price / its log-linear trend}; plain mean-1 levels with too few years."""
    values = real(history)
    if not values:
        return {}
    trend = log_trend(values)
    if trend is None:
        mean = sum(values.values()) / len(values)
        return {y: v / mean for y, v in values.items()}
    return {y: v / trend(y) for y, v in values.items()}


def persistence(series: list[dict[int, float]]) -> float:
    """Lag-1 autocorrelation of the detrended log real price, pooled over the series."""
    pairs = []
    for history in series:
        dev = {y: math.log(v) for y, v in deviations(history).items() if v > 0}
        pairs += [(dev[y - 1], dev[y]) for y in dev if y - 1 in dev]
    if len(pairs) < MIN_POINTS:
        return 0.0
    mx = sum(a for a, _ in pairs) / len(pairs)
    my = sum(b for _, b in pairs) / len(pairs)
    sxy = sum((a - mx) * (b - my) for a, b in pairs)
    sxx = sum((a - mx) ** 2 for a, _ in pairs)
    return max(0.0, min(1.0, sxy / sxx)) if sxx else 0.0


@lru_cache(maxsize=1)
def harvest_prices() -> dict[str, dict[int, float]]:
    """{crop: {year: US September price received}} in the planner's units."""
    out: dict[str, dict[int, float]] = {}
    if HARVEST_CSV.exists():
        with HARVEST_CSV.open(newline="") as handle:
            for row in csv.DictReader(handle):
                if row["month"] == HARVEST_MONTH:
                    out.setdefault(row["crop"], {})[int(row["year"])] = float(row["value"])
    return out


@lru_cache(maxsize=1)
def outlooks() -> dict[tuple[str, int], list[dict]]:
    """{(series, marketing-year start): [rows]} of data/price_outlook.csv."""
    out: dict[tuple[str, int], list[dict]] = {}
    if OUTLOOK_CSV.exists():
        with OUTLOOK_CSV.open(newline="") as handle:
            for row in csv.DictReader(handle):
                out.setdefault((row["series"], int(row["year"])), []).append(row)
    return out


def _outlook(series: str, year: int, kind: str, as_of: str | None = None) -> float | None:
    """The latest `kind` outlook for marketing year `year` published on or before `as_of`
    (an ISO date; a published month YYYY-MM counts as its first day). A plan for P is made
    in the autumn of P-1, so it sees only what was out by the end of November P-1."""
    rows = [
        r
        for r in outlooks().get((series, year), [])
        if r["kind"] == kind and (as_of is None or r["published"] <= as_of)
    ]
    return float(max(rows, key=lambda r: r["published"])["price_usd"]) if rows else None


@dataclass(frozen=True)
class Expected:
    price: float  # USD per unit at the field
    method: str  # outlook | autoregressive | quote
    detail: str


def known(history: dict[int, float], plan_year: int | None) -> dict[int, float]:
    """The marketing-year prices final before the plan starts (through P-2)."""
    if plan_year is None:
        return dict(history)
    return {y: v for y, v in history.items() if y <= plan_year - 2}


def state_ratio(state: dict[int, float], us: dict[int, float], plan_year: int | None) -> float:
    """Mean of the field's state price over the US price in the recent known years."""
    common = sorted(set(known(state, plan_year)) & set(known(us, plan_year)))[-RATIO_YEARS:]
    ratios = [state[y] / us[y] for y in common if us[y] > 0]
    return sum(ratios) / len(ratios) if ratios else 1.0


def harvest_gap(history: dict[int, float], sep: dict[int, float]) -> float:
    """Geometric mean of marketing-year price / September price over the last 15 known years:
    the September price stands for the unfinished marketing year (harvest prices sit below the
    marketing-year mean for most crops)."""
    gaps = [history[y] / sep[y] for y in sorted(history) if y in sep and sep[y] > 0][-15:]
    return math.exp(sum(math.log(g) for g in gaps) / len(gaps)) if gaps else 1.0


def expected_us_price(
    crop: str,
    plan_year: int,
    us_history: dict[int, float],
    rho: float,
) -> Expected | None:
    """The US price of marketing year `plan_year` as known in the autumn of plan_year - 1."""
    series = OUTLOOK_SERIES.get(crop)
    sep = harvest_prices().get(crop, {})
    history = known(us_history, plan_year)
    if series:
        as_of = f"{plan_year - 1}-11-30"
        base = _outlook(series, plan_year, "baseline", as_of)
        if base is not None:
            # the baseline is older than the latest WASDE: carry the WASDE's departure from the
            # baseline for the current year forward with the measured persistence
            current, base_now = (
                _outlook(series, plan_year - 1, "wasde", as_of),
                _outlook(series, plan_year - 1, "baseline", as_of),
            )
            shift = (current / base_now) ** rho if current and base_now else 1.0
            # outlooks are nominal: into constant dollars of the latest CPI year, as the
            # autoregressive price and the realised prices are (1.0 for a year past the table)
            price = base * shift * cpi()[max(cpi())] / cpi_of(plan_year)
            detail = f"USDA baseline {plan_year}/{str(plan_year + 1)[2:]}"
            if shift != 1.0:
                detail += f" x (Nov WASDE / baseline {plan_year - 1})^{rho:.2f}"
            if series != crop:  # a wheat class: its price relative to all wheat
                own, every = sep.get(plan_year - 1), current or base_now
                if own is None or not every:
                    return None
                price *= own * harvest_gap(history, sep) / every
                detail += f", x {crop} September {plan_year - 1} (to marketing year) / all wheat"
            return Expected(price, "outlook", detail)
    # no outlook: AR(1) of the detrended log real price, from the latest known level
    trend = log_trend(real(history))
    if trend is None or plan_year - 1 not in sep:
        return None
    gap = harvest_gap(history, sep)
    last = plan_year - 1
    level = sep[last] * gap / cpi_of(last) / trend(last)
    dollars = cpi()[max(cpi())]  # constant dollars of the latest CPI year
    price = trend(plan_year) * level**rho * dollars
    return Expected(
        price,
        "autoregressive",
        f"September {last} price x {gap:.2f}, persistence {rho:.2f}, trend to {plan_year}",
    )


def harvest_levels(crop: str, plan_year: int | None) -> dict[int, float]:
    """{year: detrended real September price} known before the plan (through P-1)."""
    sep = harvest_prices().get(crop, {})
    if plan_year is not None:
        sep = {y: v for y, v in sep.items() if y <= plan_year - 1}
    return deviations(sep)
