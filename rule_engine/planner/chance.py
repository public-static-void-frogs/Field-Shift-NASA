"""Carry-over between years: which historical year is likely to come next.

With independent draws nothing observed this year says anything about the next one, so the best
plan is a fixed sequence. Two things do carry over and are known before planting:

- drought: the Drought Monitor class at the field at the end of one season against its class at
  the start of the next. Across the national sample (102,570 field-year pairs, 2015-2025) the
  two correlate at 0.45, and a season that starts in drought stays drier (0.50 with midseason).
- price: the harvest (September) price level of one year against the level of the year before
  the candidate year, both in constant dollars around their trend (prices.harvest_levels). The
  marketing-year price is not used: it is final only months after the next crop is planned.

The plan starts after the latest year with a known harvest price. When that year has no drawable
season yet (planning in the autumn of 2026 for 2027, before the 2026 season is in the data), it is
added as a row of its own: the odds of the first planned year given the price just seen, with no
drought signal until the season's data is in. It is never drawn as a future year.

The next year is drawn from the historical years, weighted by how closely each year's starting
conditions resemble the conditions the plan has just reached (a nearest-neighbour bootstrap, the
resampling scheme of Lall and Sharma 1996 for hydrologic series, recalled, not re-read):

    weight(i -> j) = exp(-1/2 * sum_k ((end_i[k] - start_j[k]) / (bandwidth * sd_k))^2)
    P(i -> j)      = (1 - strength) / n + strength * weight / sum(weight)

`strength` 0 gives independent years again. With about ten years the conditional odds rest on a
handful of analog years: they show direction, not calibrated probabilities.

A season that ends in conditions few years started from (a severe drought class in late October)
would put nearly all the weight on one year, and the forecast would be that single year. The
kernel of such a row is widened until the odds are spread over at least sqrt(n) years (the
number of neighbours Lall and Sharma draw from).
"""

import math
from dataclasses import dataclass
from statistics import mean, pstdev

EDGE_WEEKS = 4  # weeks at each end of the summarised season (April; late October)
MIN_YEARS = 5
SIGNALS = ("drought", "price")
WIDEN_STEP = 1.25  # kernel widening per step when a row's odds rest on too few years


def effective_years(odds: list[float]) -> float:
    """How many equally likely years the odds amount to (1 / sum of squares)."""
    return 1.0 / sum(p * p for p in odds)


@dataclass(frozen=True)
class Persistence:
    strength: float = 1.0  # 0 = independent years, 1 = analog weights only
    bandwidth: float = 1.0  # kernel width in standard deviations of each signal


def _edge(series, part: slice) -> float | None:
    if not series:
        return None
    values = [v for v in series[part] if v is not None and not math.isnan(v)]
    return mean(values) if values else None


def harvest_level(basis) -> dict[int, float]:
    """{year: mean detrended harvest price level over the field's priced crops}."""
    out: dict[int, list[float]] = {}
    for b in basis.values():
        if b.price_years > 0:
            for year, value in b.harvest_levels.items():
                out.setdefault(year, []).append(value)
    return {y: mean(v) for y, v in out.items()}


def year_signals(years, seasons, basis) -> tuple[dict, dict]:
    """({year: start signals}, {year: end signals}) for the drawable years, plus the end
    signals of the current year when its harvest price is known before its season is drawable."""
    level = harvest_level(basis)
    start, end = {}, {}
    for y in years:
        season = seasons.get(y.year)
        drought = season.weekly.get("dm_max") if season is not None else None
        start[y.year] = {
            "drought": _edge(drought, slice(0, EDGE_WEEKS)),
            "price": level.get(y.year - 1),
        }
        end[y.year] = {
            "drought": _edge(drought, slice(-EDGE_WEEKS, None)),
            "price": level.get(y.year),
        }
    last = max((y.year for y in years), default=None)
    current = max(level, default=None)
    if last is not None and current is not None and current > last:
        end[current] = {"drought": None, "price": level[current]}
    return start, end


class YearChain:
    """Transition odds between the drawable years; `latest` is the year the plan starts after.

    `labels` are the drawable years, then the current year when it is not drawable: it has a
    row of odds (where the plan goes from it) and no column (it is never drawn)."""

    def __init__(self, labels: list[int], start: dict, end: dict, persistence: Persistence):
        self.labels, self.start, self.end = labels, start, end
        self.persistence = persistence
        drawable = [y for y in labels if y in start]
        n = len(drawable)
        self.latest = len(labels) - 1
        scale = {}
        for k in SIGNALS:
            values = [
                s[y][k] for s in (start, end) for y in s if y in labels and s[y][k] is not None
            ]
            spread = pstdev(values) if len(values) > 1 else 0.0
            if spread > 1e-9:
                scale[k] = spread * persistence.bandwidth
        self.signals = tuple(scale)
        self.matrix: list[list[float]] = []
        for i in labels:
            distance = [0.0] * n
            for k, width in scale.items():
                here = end[i][k]
                if here is None:
                    continue
                parts = [
                    None if start[j][k] is None else ((here - start[j][k]) / width) ** 2
                    for j in drawable
                ]
                known = [p for p in parts if p is not None]
                neutral = mean(known) if known else 0.0  # an unknown start is neither near nor far
                distance = [d + (neutral if p is None else p) for d, p in zip(distance, parts)]
            s = persistence.strength
            widen = 1.0
            while True:
                weights = [math.exp(-0.5 * d / widen**2) for d in distance]
                total = sum(weights)
                odds = [(1.0 - s) / n + s * w / total for w in weights]
                if effective_years(odds) >= math.sqrt(n):  # reached as the kernel flattens
                    break
                widen *= WIDEN_STEP
            self.matrix.append(odds)
        self._marginal = [self.matrix[self.latest]]

    def marginal(self, t: int) -> list[float]:
        """Odds of each year at plan step t, seen from the start of the plan."""
        while len(self._marginal) <= t:
            last = self._marginal[-1]
            n = len(last)
            self._marginal.append(
                [sum(last[i] * self.matrix[i][j] for i in range(n)) for j in range(n)]
            )
        return self._marginal[t]

    def describe(self) -> dict:
        first = self.matrix[self.latest]
        return {
            "strength": self.persistence.strength,
            "bandwidthSd": self.persistence.bandwidth,
            "signals": list(self.signals),
            "planStartsAfter": self.labels[self.latest],
            "firstYearOdds": {str(y): round(p, 3) for y, p in zip(self.labels, first)},
            "effectiveAnalogYears": round(effective_years(first), 1),
            "endOfYear": {
                str(y): {k: _rounded(self.end[y][k]) for k in self.signals} for y in self.labels
            },
        }


def _rounded(value):
    return None if value is None else round(value, 2)


def build_chain(years, seasons, basis, persistence: Persistence) -> YearChain | None:
    if persistence.strength <= 0 or len(years) < MIN_YEARS:
        return None
    start, end = year_signals(years, seasons, basis)
    labels = [y.year for y in years] + [y for y in end if y not in start]
    chain = YearChain(labels, start, end, persistence)
    return chain if chain.signals else None
