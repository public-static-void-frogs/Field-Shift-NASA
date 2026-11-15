"""One field's planning problem as plain arrays, for training one policy across many fields.

The yearly reward of an action factors exactly (model.factors, model.year_terms):

    reward[node, action, year] = scale[node, action] x gain[crop, year]
                                 + fixed[node, action] + weather[crop, year]

`tabulate(model)` walks every crop history reachable within the horizon and stores `scale` and
`fixed` per (history, action) and `gain` and `weather` per (crop, year). That is about 25 times
smaller than the full reward array, so tens of thousands of fields fit in memory. Exact solving
and policy scoring run in numpy in milliseconds, and a learning agent steps thousands of fields
at once.

Two simplifications against `RotationModel`:

- The soil carbon pools are held at their starting values when the soil term is computed. The
  yearly gain is `input - old pool x decay` and the old pool moves by well under 1 % within a
  plan, so the difference is a few cents per acre (checked in the tests).
- `Weights.risk_aversion` must be 0: the tables store means, not spreads.

A field plans at most MAX_FIELD_CROPS crops. Its arrays use local actions (the field's crop
slot x tillage x cover); `FieldTable.crops` maps each slot to the global crop list `CROPS`, and
`global_actions` to the global action list `ACTIONS` that every field and the policy share.
"""

from dataclasses import dataclass

import numpy as np

from rule_engine.planner.dynamics import Action, State, shift
from rule_engine.planner.model import MAX_CROPS, RotationModel
from rule_engine.planner.tables import COVER, CROPS, TILLAGE

PRACTICES = tuple((t, k) for t in TILLAGE for k in COVER)
SUB = len(PRACTICES)
ACTIONS = tuple(Action(c, t, k) for c in CROPS for t, k in PRACTICES)
ACTION_INDEX = {a: i for i, a in enumerate(ACTIONS)}
MAX_FIELD_CROPS = MAX_CROPS
LOCAL = MAX_FIELD_CROPS * SUB  # local actions of one field
SLOT = np.arange(LOCAL) // SUB  # crop slot of each local action
OTHER = len(CROPS)  # history token for a crop outside CROPS, or no record
HISTORY = 5
MAX_YEARS = 48  # drawable years a table can hold (1981-2025 is 45)
DRAINAGE = (
    "excessively drained",
    "somewhat excessively drained",
    "well drained",
    "moderately well drained",
    "somewhat poorly drained",
    "poorly drained",
    "very poorly drained",
)
STATIC_NAMES = (
    "om_pct",
    "aws_100cm_mm",
    "slope_pct",
    "drainage",
    "clay_pct",
    "sand_pct",
    "ph",
    "latitude",
    "longitude",
    "nccpi",
    "kw",
    "slope_length_m",
    "bulk_density",
    "irrigated_share",
    "ndvi_peak_mean",
    "ndvi_peak_std",
)
# (centre, scale) so that typical values land near [-1, 1]
STATIC_SCALE = {
    "om_pct": (3.0, 3.0),
    "aws_100cm_mm": (150.0, 100.0),
    "slope_pct": (4.0, 6.0),
    "drainage": (3.0, 3.0),
    "clay_pct": (25.0, 20.0),
    "sand_pct": (30.0, 30.0),
    "ph": (6.5, 1.5),
    "latitude": (40.0, 8.0),
    "longitude": (-95.0, 15.0),
    "nccpi": (0.5, 0.3),
    "kw": (0.3, 0.15),
    "slope_length_m": (50.0, 40.0),
    "bulk_density": (1.35, 0.15),
    "irrigated_share": (0.5, 0.5),
    "ndvi_peak_mean": (0.75, 0.15),
    "ndvi_peak_std": (0.07, 0.05),
}
YIELD_SCALE = {
    "corn": 180.0,
    "soybeans": 55.0,
    "sorghum": 70.0,
    "oats": 70.0,
    "winter_wheat": 55.0,
    "spring_wheat": 50.0,
    "barley": 70.0,
    "alfalfa": 3.5,
    "cotton": 850.0,  # lb lint
    "rice": 75.0,  # cwt
    "peanuts": 3800.0,  # lb
    "durum_wheat": 40.0,
    "sugarbeets": 30.0,  # ton
    "potatoes": 420.0,  # cwt
    "dry_peas": 20.0,  # cwt
    "lentils": 13.0,  # cwt
    "chickpeas": 15.0,  # cwt
    "flax": 20.0,
    "millet": 30.0,
}
PRICE_SCALE = {
    "corn": 4.5,
    "soybeans": 11.0,
    "sorghum": 4.0,
    "oats": 3.5,
    "winter_wheat": 5.5,
    "spring_wheat": 6.0,
    "barley": 4.5,
    "alfalfa": 180.0,
    "cotton": 0.65,
    "rice": 14.0,
    "peanuts": 0.25,
    "durum_wheat": 7.0,
    "sugarbeets": 45.0,
    "potatoes": 11.0,
    "dry_peas": 13.0,
    "lentils": 25.0,
    "chickpeas": 30.0,
    "flax": 13.0,
    "millet": 5.0,
}


def tokens(history: tuple[str, ...]) -> list[int]:
    """The last HISTORY crops as indices into CROPS (OTHER when outside it), oldest first."""
    padded = (None,) * (HISTORY - len(history)) + tuple(history[-HISTORY:])
    return [CROPS.index(c) if c in CROPS else OTHER for c in padded]


def field_statics(model: RotationModel) -> np.ndarray:
    """Fixed inputs of a field: soil and position (value, known flag), then per-crop economics."""
    soil, record = model.context.soil, model.context.field
    raw = {k: soil.get(k) for k in ("om_pct", "aws_100cm_mm", "slope_pct", "clay_pct", "sand_pct")}
    raw["ph"] = soil.get("ph")
    drainage = str(soil.get("drainage_class") or "").lower()
    raw["drainage"] = DRAINAGE.index(drainage) if drainage in DRAINAGE else None
    raw["latitude"], raw["longitude"] = record.get("latitude"), record.get("longitude")
    raw["nccpi"], raw["kw"] = soil.get("nccpi_all"), soil.get("kw")
    raw["slope_length_m"] = soil.get("slope_length_m")
    raw["bulk_density"] = soil.get("bulk_density_g_cm3")
    raw["irrigated_share"] = (record.get("irrigation") or {}).get("share")
    greenness = record.get("greenness") or {}
    raw["ndvi_peak_mean"] = greenness.get("ndvi_peak_mean")
    raw["ndvi_peak_std"] = greenness.get("ndvi_peak_std")
    out = []
    for name in STATIC_NAMES:
        centre, scale = STATIC_SCALE[name]
        value = raw[name]
        out += [0.0 if value is None else (float(value) - centre) / scale, float(value is not None)]
    for crop in CROPS:
        basis = model.sampler.basis.get(crop) if crop in model.crops else None
        out += (
            [0.0, 0.0, 0.0]
            if basis is None
            else [1.0, basis.expected_yield / YIELD_SCALE[crop], basis.price / PRICE_SCALE[crop]]
        )
    return np.asarray(out, dtype=np.float32)


def year_signals(model: RotationModel) -> np.ndarray:
    """[year, 2]: drought class and price level at the end of each drawable year (0 if unknown)."""
    out = np.zeros((MAX_YEARS, 2), dtype=np.float32)
    if model.chain is not None:
        for i, year in enumerate(model.chain.labels):
            end = model.chain.end[year]
            out[i, 0] = (end["drought"] or 0.0) / 3.0
            out[i, 1] = (end["price"] or 1.0) - 1.0
    return out


@dataclass
class FieldTable:
    field_id: str
    county: str
    region: str
    crops: np.ndarray  # [slot] index into CROPS, -1 for an unused slot
    scale: np.ndarray  # [node, local action] multiplies gain
    fixed: np.ndarray  # [node, local action] USD/acre: -cost - rotation risk + soil value
    gain: np.ndarray  # [slot, year] USD/acre: yield x water modifier x price
    weather: np.ndarray  # [slot, year] USD/acre: -weather risk penalty
    mask: np.ndarray  # [node, local action] action allowed
    next_node: np.ndarray  # [node, slot] node index, -1 at the end of the plan
    node_t: np.ndarray  # [node]
    node_history: np.ndarray  # [node, HISTORY] tokens
    odds: np.ndarray  # [year, year] odds of the next year given the year just experienced
    first: int  # index of the year the plan starts after
    signals: np.ndarray  # [year, 2]
    statics: np.ndarray
    horizon: int
    # the parts of `fixed` and `weather`, so the weights can change without a rebuild:
    # cost, points, erosion, soil [node, local action]; weather_points, cost_shift [slot, year].
    # fixed = -cost - risk_usd_per_point x points - erosion + soil;
    # weather = -risk_usd_per_point x weather_points - cost_shift. None in tables before v5.
    terms: dict | None = None
    risk_usd_per_point: float | None = None

    @property
    def nodes(self) -> int:
        return len(self.node_t)

    def reweighted(
        self, risk_usd_per_point: float, soil_scale: float = 1.0, erosion_scale: float = 1.0
    ) -> tuple[np.ndarray, np.ndarray]:
        """(fixed, weather) under another risk-point price and scaled soil and erosion terms."""
        if self.terms is None:
            raise ValueError("this table predates the stored terms: rebuild it")
        t = self.terms
        fixed = (
            -t["cost"]
            - risk_usd_per_point * t["points"]
            - erosion_scale * t["erosion"]
            + soil_scale * t["soil"]
        )
        weather = -risk_usd_per_point * t["weather_points"] - t["cost_shift"]
        return fixed.astype(np.float32), weather.astype(np.float32)

    @property
    def reward(self) -> np.ndarray:
        """[node, local action, year] USD/acre, expanded from the factors."""
        return (
            self.scale[:, :, None] * self.gain[SLOT][None]
            + self.fixed[:, :, None]
            + self.weather[SLOT][None]
        )

    @property
    def global_actions(self) -> np.ndarray:
        """[local action] index into ACTIONS (meaningless where the slot is unused)."""
        return np.maximum(self.crops, 0)[SLOT] * SUB + np.arange(LOCAL) % SUB


def tabulate(model: RotationModel) -> FieldTable:
    if model.weights.risk_aversion:
        raise ValueError("tables store mean rewards: use risk_aversion=0")
    if len(model.years) + 1 > MAX_YEARS:  # the drawable years and the current year
        raise ValueError(f"at most {MAX_YEARS} drawable years")
    if len(model.crops) > MAX_FIELD_CROPS or set(model.crops) - set(CROPS):
        raise ValueError(f"at most {MAX_FIELD_CROPS} crops, all from {CROPS}")
    if (model.tillage, model.cover) != (TILLAGE, COVER):
        raise ValueError("tables use the full tillage and cover lists")
    slot = {crop: i for i, crop in enumerate(model.crops)}
    local = {
        Action(crop, t, k): slot[crop] * SUB + j
        for crop in model.crops
        for j, (t, k) in enumerate(PRACTICES)
    }
    start = model.open_loop_state
    index = {(0, start.history): 0}
    order = [(0, start.history)]
    scale, fixed, mask, following = [], [], [], []
    parts = {k: [] for k in ("cost", "points", "erosion", "soil")}
    cursor = 0
    while cursor < len(order):
        t, history = order[cursor]
        cursor += 1
        state = State(t, history, start.young, start.old, None)
        previous = history[-1] if history else None
        row_scale = np.zeros(LOCAL, dtype=np.float32)
        row_fixed = np.zeros(LOCAL, dtype=np.float32)
        row_mask = np.zeros(LOCAL, dtype=bool)
        row_next = np.full(MAX_FIELD_CROPS, -1, dtype=np.int32)
        row_parts = {k: np.zeros(LOCAL, dtype=np.float32) for k in parts}
        for action in model.actions(state):
            a = local[action]
            row_scale[a], base = model.factors(history, action)
            soil = model._soil_reward(state, action)
            row_fixed[a] = base + soil
            row_parts["cost"][a] = model._fixed_cost(
                action, previous, model._establishment(state, action)
            )
            row_parts["points"][a] = model.adapter.history_part(
                history, action.crop, action.tillage, action.cover
            ).points
            row_parts["erosion"][a] = model._erosion_usd(action)
            row_parts["soil"][a] = soil
            row_mask[a] = True
            if t + 1 < model.horizon:
                key = (t + 1, shift(history, action.crop))
                if key not in index:
                    index[key] = len(order)
                    order.append(key)
                row_next[slot[action.crop]] = index[key]
        scale.append(row_scale)
        fixed.append(row_fixed)
        mask.append(row_mask)
        following.append(row_next)
        for k, row in row_parts.items():
            parts[k].append(row)
    n = len(model.years)
    gain = np.zeros((MAX_FIELD_CROPS, MAX_YEARS), dtype=np.float32)
    weather = np.zeros((MAX_FIELD_CROPS, MAX_YEARS), dtype=np.float32)
    weather_points = np.zeros((MAX_FIELD_CROPS, MAX_YEARS), dtype=np.float32)
    cost_shift = np.zeros((MAX_FIELD_CROPS, MAX_YEARS), dtype=np.float32)
    crops = np.full(MAX_FIELD_CROPS, -1, dtype=np.int8)
    for crop, i in slot.items():
        crops[i] = CROPS.index(crop)
        gain[i, :n], weather[i, :n] = model.year_terms(crop)
        weather_points[i, :n] = [_weather_points(year.crops[crop]) for year in model.years]
        cost_shift[i, :n] = model._cost_shift[crop]
    terms = {k: np.stack(v) for k, v in parts.items()}
    terms["weather_points"], terms["cost_shift"] = weather_points, cost_shift
    odds = np.zeros((MAX_YEARS, MAX_YEARS), dtype=np.float32)
    odds[:, :n] = 1.0 / n
    if model.chain is not None:
        matrix = np.asarray(model.chain.matrix, dtype=np.float32)
        odds[: len(matrix), :n] = matrix  # a last row for the current year when it is not drawable
    return FieldTable(
        field_id=str(model.context.field.get("id")),
        county=str(model.context.field.get("countyFips") or ""),
        region=model.context.region,
        crops=crops,
        scale=np.stack(scale),
        fixed=np.stack(fixed),
        gain=gain,
        weather=weather,
        mask=np.stack(mask),
        next_node=np.stack(following),
        node_t=np.asarray([t for t, _ in order], dtype=np.int16),
        node_history=np.asarray([tokens(h) for _, h in order], dtype=np.int8),
        odds=odds,
        first=model.chain.latest if model.chain is not None else 0,
        signals=year_signals(model),
        statics=field_statics(model),
        horizon=model.horizon,
        terms=terms,
        risk_usd_per_point=model.weights.risk_usd_per_point,
    )


def _weather_points(draw) -> float:
    """The risk points of a drawn season (as model.year_terms counts them)."""
    if draw.weather is None:
        return 0.0
    return draw.weather.county_points + sum(
        hit.points for hit in draw.weather.hazards if hit.rule not in draw.paid_rules
    )


def expected_reward(table: FieldTable) -> np.ndarray:
    """[node, year just experienced, local action]: expected reward of the coming year."""
    odds = table.odds.astype(np.float64)
    gain = (odds @ table.gain.T.astype(np.float64))[:, SLOT]  # [year just experienced, action]
    weather = (odds @ table.weather.T.astype(np.float64))[:, SLOT]
    return table.scale[:, None, :] * gain[None] + table.fixed[:, None, :] + weather[None]


def score(table: FieldTable, choice=None) -> tuple[float, np.ndarray]:
    """(expected plan value, local action per [node, year just experienced]).

    `choice` is the policy to score as an [node, year] array of local action indices, or a
    function from the [node, year, action] values to such an array. None solves for the optimum.
    """
    immediate = expected_reward(table)
    value = np.zeros((table.nodes, MAX_YEARS), dtype=np.float64)
    taken = np.zeros((table.nodes, MAX_YEARS), dtype=np.int64)
    blocked = np.where(table.mask, 0.0, -np.inf)[:, None, :]
    for t in range(table.horizon - 1, -1, -1):
        nodes = np.flatnonzero(table.node_t == t)
        q = immediate[nodes]
        if t + 1 < table.horizon:
            ahead = value @ table.odds.T.astype(np.float64)  # [node, year just experienced]
            following = np.maximum(table.next_node[nodes], 0)[:, SLOT]  # [node, action]
            q = q + np.transpose(ahead[following], (0, 2, 1))
        q = q + blocked[nodes]
        if choice is None:
            pick = q.argmax(axis=2)
        elif callable(choice):
            pick = choice(immediate[nodes] + blocked[nodes], nodes)
        else:
            pick = choice[nodes]
        taken[nodes] = pick
        value[nodes] = np.take_along_axis(q, pick[:, :, None], axis=2)[:, :, 0]
    return float(value[0, table.first]), taken


def myopic_choice(immediate: np.ndarray, nodes: np.ndarray) -> np.ndarray:
    return immediate.argmax(axis=2)
