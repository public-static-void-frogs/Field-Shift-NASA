"""The planner's own reference tables: production costs, weather yield response, soil carbon.

Every row carries its source and a `verified` flag. Unverified rows are usable but are reported
under data gaps by the environment, the same way the rule engine treats unverified traits.
"""

import csv
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import rule_engine

DATA = Path(__file__).parent / "data"
# t/ha per (unit per acre) of the mass units, the same for every crop: short ton, pound,
# hundredweight (100 lb). Bushels depend on the crop (catalog bu_to_t_ha).
MASS_T_HA = {"ton": 2.24170, "lb": 0.00112085, "cwt": 0.112085}
TILLAGE = ("conventional", "strip_till", "no_till")
COVER = ("none", "rye")
# Crops the planner can price: the ones with a cost budget (costs.csv, costs_regional.csv,
# costs_alfalfa.csv, costs_extension.csv). The order fixes the policy's action list.
CROPS = (
    "corn",
    "soybeans",
    "sorghum",
    "oats",
    "winter_wheat",
    "spring_wheat",
    "barley",
    "alfalfa",
    "cotton",
    "rice",
    "peanuts",
    "durum_wheat",
    "sugarbeets",
    "potatoes",
    "dry_peas",
    "lentils",
    "chickpeas",
    "flax",
    "millet",
)
NEEDS_IRRIGATION = frozenset({"rice"})  # flooded paddies: not planned on a dryland field
NATIONAL = "U.S. total"
# Field passes of each tillage system, priced at the region's custom rates (costs_tillage.csv).
# For drilled crops "strip_till" stands for reduced tillage: one disk pass.
PASSES = {
    "row": {
        "conventional": ("chisel", "field_cultivate", "plant"),
        "strip_till": ("strip_till", "plant"),
        "no_till": ("plant_no_till", "spray", "burndown_herbicide"),
    },
    "drilled": {
        "conventional": ("disk", "field_cultivate", "drill"),
        "strip_till": ("disk", "drill"),
        "no_till": ("drill_no_till", "spray", "burndown_herbicide"),
    },
}
DRILLED = frozenset(
    {"oats", "winter_wheat", "spring_wheat", "durum_wheat", "barley", "rye", "canola", "alfalfa",
     "rice", "dry_peas", "lentils", "chickpeas", "flax", "millet"}
)  # fmt: skip
# ERS reports rice by production regions of its own, and splits the Southern Seaboard farm resource
# region by state for peanuts. A county outside rice_regions.csv takes its state's region.
RICE_STATES = {  # state -> (region, verified): EIB-202 names Texas Gulf Coast, Mississippi Delta
    "CA": ("California", True),
    "TX": ("Gulf Coast", True),
    "MS": ("Mississippi River Delta", True),
    "AR": ("Arkansas Non-Delta", False),
    "MO": ("Arkansas Non-Delta", False),
    "LA": ("Mississippi River Delta", False),
}
PEANUT_SEABOARD = {
    "AL": "Southern Seaboard (AL, GA)",
    "GA": "Southern Seaboard (AL, GA)",
    "VA": "Southern Seaboard (VA, NC, SC)",
    "NC": "Southern Seaboard (VA, NC, SC)",
    "SC": "Southern Seaboard (VA, NC, SC)",
}
# Cost series of each crop in costs_regional_history.csv / costs_early_history.csv
COST_SERIES: dict[str, str] = {}  # crop -> series name where they differ


def unit_kind(unit: str | None) -> str:
    """ "bu/acre", "tons", "$ / CWT", "usd/lb" -> "bu", "ton", "cwt", "lb"."""
    text = (unit or "").lower().replace("$", "").replace("usd", "").strip(" /")
    head = text.split("/")[0].strip()
    return {"tons": "ton", "lbs": "lb", "bushel": "bu", "bushels": "bu"}.get(head, head)


def t_ha_per(crop, unit: str | None) -> float | None:
    """t/ha per one `unit` per acre for a catalog crop; None when it cannot be converted."""
    kind = unit_kind(unit)
    if kind == "bu":
        return crop.bu_to_t_ha
    if kind == "ton":
        return crop.ton_to_t_ha or MASS_T_HA["ton"]
    return MASS_T_HA.get(kind)


def rule_data() -> Path:
    """The rule engine's data folder: the one of the rule_engine package actually imported."""
    return Path(rule_engine.__file__).parent / "data"


@lru_cache(maxsize=1)
def processor_counties() -> dict[str, frozenset[str]]:
    """{crop: counties (five-digit FIPS) that grow it}, for crops sold under contract to a nearby
    factory (sugarbeets, potatoes, sugarcane). processor_counties.csv is copied from the FieldSense
    planner (its scripts/build_processor_counties.py: CDL 2021-2025 on the usa_sample_v3 fields,
    counties where the crop holds at least 0.5 % of the sampled acres). Alfalfa, sold as hay
    within trucking distance, is limited the same way to the counties of hay_counties.csv
    (scripts/build_hay_counties.py)."""
    found: dict[str, set[str]] = {}
    hay = DATA / "hay_counties.csv"
    for r in _rows("processor_counties.csv") + (_rows(hay.name) if hay.exists() else []):
        found.setdefault(r["crop"], set()).add(r["county_fips"].zfill(5))
    return {crop: frozenset(counties) for crop, counties in found.items()}


def _rows(name: str) -> list[dict[str, str]]:
    with (DATA / name).open(newline="") as handle:
        return list(csv.DictReader(handle))


def _flag(value: str) -> bool:
    return value.strip().lower() == "true"


@dataclass(frozen=True)
class Cost:
    usd_per_acre: float
    verified: bool
    sources: tuple[str, ...]


def _add(level: Cost, usd: float, other: Cost) -> Cost:
    """`level` moved by `usd`, a difference taken from `other`."""
    sources = tuple(dict.fromkeys(level.sources + other.sources))
    return Cost(level.usd_per_acre + usd, level.verified and other.verified, sources)


@lru_cache(maxsize=1)
def _ers_regions() -> dict[str, str]:
    return {r["county_fips"]: r["region"] for r in _rows("ers_regions.csv")}


def ers_region(county_fips: str | None) -> str | None:
    """USDA ERS farm resource region of a county (five-digit FIPS), None when unknown."""
    return _ers_regions().get(str(county_fips or "").zfill(5))


@lru_cache(maxsize=1)
def _rice_regions() -> dict[str, tuple[str, bool]]:
    return {
        r["county_fips"]: (r["region"], _flag(r["verified"])) for r in _rows("rice_regions.csv")
    }


def crop_region(
    crop: str, county_fips: str | None, region: str | None, state: str | None
) -> tuple[str | None, bool]:
    """(ERS cost region, whether ERS's own description places the field there) for a crop.

    Rice: the county's row of rice_regions.csv (scripts/build_rice_regions.py), else its state's
    region (RICE_STATES), else the farm resource region, which has no rice row. Peanuts: ERS
    reports the Prairie Gateway and Fruitful Rim farm resource regions, and the Southern Seaboard
    split into AL-GA and VA-NC-SC; a Southern Seaboard county of another state (FL, MS) takes the
    AL-GA row, unverified. Other crops: the farm resource region."""
    if crop == "rice":
        county = _rice_regions().get(str(county_fips or "").zfill(5))
        return county or RICE_STATES.get(state or "", (region, True))
    if crop == "peanuts" and region == "Southern Seaboard":
        if state in PEANUT_SEABOARD:
            return PEANUT_SEABOARD[state], True
        return PEANUT_SEABOARD["GA"], False
    return region, True


@lru_cache(maxsize=1)
def _byproducts() -> dict[tuple[str, str], tuple[str, float]]:
    return {
        (r["crop"], r["region"]): (r["product"], float(r["value_share"]))
        for r in _rows("byproducts.csv")
    }


def byproduct_share(crop: str, region: str | None) -> tuple[str, float] | None:
    """(by-product, its value / the main product's value) in the field's ERS region, else the
    U.S. mean (byproducts.csv, from scripts/build_byproducts.py). None for crops without one."""
    table = _byproducts()
    return table.get((crop, region or "")) or table.get((crop, "U.S. total"))


@lru_cache(maxsize=1)
def state_crop_shares() -> dict[tuple[str, str], float]:
    """{(state, crop): share of the state's CSB acres}, from the rule engine's state_crops.csv
    (CDL labels: a satellite estimate)."""
    path = rule_data() / "state_crops.csv"
    if not path.exists():
        return {}
    with path.open(newline="") as handle:
        return {(r["region"], r["crop"]): float(r["acre_share"]) for r in csv.DictReader(handle)}


class CostTable:
    """Cost of production per acre, land excluded, so the result is a return to land.

    Without a `region` every number comes from costs.csv (Iowa and Nebraska budgets).

    With a `region` (ERS farm resource region):

    - the level of a crop's cost comes from the ERS regional table (costs_regional.csv); a crop
      ERS does not report for the region uses the national ERS row, flagged unverified;
    - the difference between tillage systems is the difference between their field passes
      (PASSES) at the region's custom rates (costs_tillage.csv), for every crop; a rate the
      region's survey lacks is the mean of the other regions, flagged unverified;
    - alfalfa, which ERS does not cover, uses the extension budget of the `state` or else of the
      region (costs_alfalfa.csv), moved to the field's yield by a harvest cost per ton;
    - sugarbeets, potatoes, dry peas, lentils, chickpeas, flax and millet, which ERS does not
      cover either, use extension budgets (costs_extension.csv): the `state`'s own budget when
      there is one, else the region's, else the national row, flagged unverified;
    - rice and peanuts use the ERS region of their own that holds the `county` or `state`
      (crop_region), unverified where ERS's description does not place it;
    - costs.csv still supplies the difference between corn after corn and corn after another
      crop.
    """

    def __init__(
        self,
        rows=None,
        cover_rows=None,
        region: str | None = None,
        regional_rows=None,
        state: str | None = None,
        tillage_rows=None,
        alfalfa_rows=None,
        extension_rows=None,
        county: str | None = None,
    ):
        self.region, self.state, self.county = region, state, county
        self.regional: dict[str, Cost] = {}
        self.wet: dict[str, float] = {}  # crop: irrigated share of the acres its budget prices
        self.operations: dict[str, Cost] = {}
        self.alfalfa: dict[str, tuple[Cost, float]] = {}
        self.harvest_per_ton: Cost | None = None
        if region is not None:
            found = regional_rows if regional_rows is not None else _rows("costs_regional.csv")
            found = list(found) + list(
                extension_rows if extension_rows is not None else _rows("costs_extension.csv")
            )
            for r in found:
                cost = Cost(float(r["usd_per_acre"]), _flag(r["verified"]), (r["source"],))
                own, placed = crop_region(r["crop"], county, region, state)
                if r["region"] == own:
                    self.regional[r["crop"]] = Cost(
                        cost.usd_per_acre, cost.verified and placed, cost.sources
                    )
                    self.wet[r["crop"]] = _budget_share(r)
                elif r["region"] == NATIONAL and r["crop"] not in self.regional:
                    self.regional[r["crop"]] = Cost(cost.usd_per_acre, False, cost.sources)
                    self.wet[r["crop"]] = _budget_share(r)
            for crop, cost in _lapsed_regions(region, state, county).items():
                if crop in self.regional and not self.regional[crop].verified:
                    self.regional[crop] = cost
                    own = crop_region(crop, county, region, state)[0]
                    self.wet[crop] = _budget_share({"crop": crop, "region": own})
            for r in found:  # an extension budget of the field's own state (postal code) wins
                if state is not None and r["region"] == state:
                    self.regional[r["crop"]] = Cost(
                        float(r["usd_per_acre"]), _flag(r["verified"]), (r["source"],)
                    )
                    self.wet[r["crop"]] = _budget_share(r)
            self._load_operations(
                tillage_rows if tillage_rows is not None else _rows("costs_tillage.csv")
            )
            self._load_alfalfa(
                alfalfa_rows if alfalfa_rows is not None else _rows("costs_alfalfa.csv"), state
            )
        self.rows = {
            (r["crop"], r["situation"], r["tillage"]): Cost(
                float(r["usd_per_acre"]), _flag(r["verified"]), (r["source"],)
            )
            for r in (rows if rows is not None else _rows("costs.csv"))
        }
        self.cover: dict[str, Cost] = {}
        for r in cover_rows if cover_rows is not None else _rows("cover_costs.csv"):
            old = self.cover.get(r["cover_crop"], Cost(0.0, True, ()))
            self.cover[r["cover_crop"]] = Cost(
                old.usd_per_acre + float(r["usd_per_acre"]),
                old.verified and _flag(r["verified"]),
                old.sources + (r["source"],),
            )
        self.crops = {key[0] for key in self.rows} | set(self.regional)

    def _load_operations(self, rows) -> None:
        everywhere: dict[str, list[float]] = {}
        for r in rows:
            everywhere.setdefault(r["operation"], []).append(float(r["usd_per_acre"]))
            if r["region"] == self.region:
                self.operations[r["operation"]] = Cost(
                    float(r["usd_per_acre"]), _flag(r["verified"]), (r["source"],)
                )
        for operation, values in everywhere.items():
            if operation not in self.operations:
                self.operations[operation] = Cost(
                    sum(values) / len(values),
                    False,
                    (f"{operation}: mean of the other regions' custom rates",),
                )

    def _load_alfalfa(self, rows, state: str | None) -> None:
        for area in (state, self.region):
            for r in rows:
                if r["area"] == area and r["situation"] not in self.alfalfa:
                    cost = Cost(float(r["usd_per_acre"]), _flag(r["verified"]), (r["source"],))
                    self.alfalfa[r["situation"]] = (cost, float(r["budget_ton_per_acre"]))
                    self.wet.setdefault("alfalfa", float(_flag(r.get("irrigated", "false"))))
        for r in rows:
            if r["situation"] == "harvest_per_ton":
                self.harvest_per_ton = Cost(
                    float(r["usd_per_acre"]), _flag(r["verified"]), (r["source"],)
                )

    def _situation(self, crop: str, previous: str | None) -> str:
        if crop == "corn":
            return "after_corn" if previous == "corn" else "after_other"
        if crop == "alfalfa":
            return "established" if previous == "alfalfa" else "seeding"
        return "any"

    def crop_cost(
        self,
        crop: str,
        previous: str | None,
        tillage: str,
        yield_per_acre: float | None = None,
    ) -> Cost | None:
        """Cost of growing `crop` after `previous`. `yield_per_acre` (tons) is the yield the
        cost should fit; only the regional alfalfa budgets use it."""
        local = self._budget(crop, previous, tillage)
        if self.region is None:
            return local
        situation = self._situation(crop, previous)
        if crop == "alfalfa" and situation in self.alfalfa:
            level, budget_yield = self.alfalfa[situation]
            if yield_per_acre is not None and self.harvest_per_ton is not None:
                level = _add(
                    level,
                    self.harvest_per_ton.usd_per_acre * (yield_per_acre - budget_yield),
                    self.harvest_per_ton,
                )
            if situation == "established":
                return level  # a standing crop: no tillage, no seeding
            return self._with_tillage(level, crop, tillage)
        level = self.regional.get(crop)
        if level is None:
            return local
        # corn after corn against corn after another crop, from the state budgets
        after = self._budget(crop, previous, TILLAGE[0])
        reference = self._budget(crop, None, TILLAGE[0])
        if after is not None and reference is not None and after is not reference:
            level = _add(level, after.usd_per_acre - reference.usd_per_acre, after)
        return self._with_tillage(level, crop, tillage)

    def seeding_year_yield(self, crop: str) -> float | None:
        """Seeding-year yield over an established stand's, from the field's own alfalfa budgets
        when the seeding budget harvests hay (fall-seeded desert stands cut close to a full
        year). None otherwise: crop_adjustments.csv then holds the factor."""
        if crop != "alfalfa" or self.region is None:
            return None
        seeding, established = self.alfalfa.get("seeding"), self.alfalfa.get("established")
        if seeding is None or established is None or seeding[1] <= 0 or established[1] <= 0:
            return None
        return min(1.0, seeding[1] / established[1])

    def is_regional(self, crop: str) -> bool:
        """Whether the crop's cost level is a budget for the field's region or state."""
        return crop in self.regional or (crop == "alfalfa" and bool(self.alfalfa))

    def unverified_tillages(self, crop: str) -> list[str]:
        """Tillage systems under which some number in the crop's cost is not verified."""
        if self.region is None or not self.is_regional(crop):
            return sorted(
                {t for (c, _, t), cost in self.rows.items() if c == crop and not cost.verified}
            )
        return sorted(
            tillage
            for tillage in TILLAGE
            if not all(
                self.crop_cost(crop, previous, tillage).verified for previous in (None, crop)
            )
        )

    def tillage_shift(self, crop: str, tillage: str) -> Cost:
        """Cost of the tillage system's field passes less the conventional system's."""
        passes = PASSES["drilled" if crop in DRILLED else "row"]
        if tillage == TILLAGE[0] or not self.operations:
            return Cost(0.0, True, ())
        used = [self.operations[name] for name in passes[tillage] + passes[TILLAGE[0]]]
        mine = sum(self.operations[name].usd_per_acre for name in passes[tillage])
        base = sum(self.operations[name].usd_per_acre for name in passes[TILLAGE[0]])
        sources = tuple(dict.fromkeys(s for cost in used for s in cost.sources))
        return Cost(mine - base, all(cost.verified for cost in used), sources)

    def _with_tillage(self, level: Cost, crop: str, tillage: str) -> Cost:
        shift = self.tillage_shift(crop, tillage)
        return _add(level, shift.usd_per_acre, shift) if shift.sources else level

    def _budget(self, crop: str, previous: str | None, tillage: str) -> Cost | None:
        """The costs.csv budget for the situation, None when the crop has none."""
        situation = self._situation(crop, previous)
        for key in ((crop, situation, tillage), (crop, situation, "any")):
            if key in self.rows:
                return self.rows[key]
        # No budget for this tillage in this situation (corn after corn): shift the conventional
        # budget by the tillage difference published for the other situation.
        base = self.rows.get((crop, situation, "conventional"))
        other = [s for (c, s, t) in self.rows if c == crop and t == tillage and s != situation]
        if base is None or not other:
            return base and Cost(base.usd_per_acre, False, base.sources)
        shifted = self.rows[(crop, other[0], tillage)]
        reference = self.rows[(crop, other[0], "conventional")]
        return Cost(
            base.usd_per_acre + shifted.usd_per_acre - reference.usd_per_acre,
            False,
            base.sources + shifted.sources,
        )

    def cover_cost(self, cover: str) -> Cost:
        if cover == "none":
            return Cost(0.0, True, ())
        return self.cover[cover]

    def irrigation_full_cost(self) -> Cost:
        """A year's cost of irrigating an acre in the state (irrigation_costs.csv): pumping
        energy, off-farm water, upkeep of the system, labour and interest on the equipment;
        the U.S. row, flagged unverified, for a state without one."""
        table = _irrigation_costs()
        return table.get(self.state) or Cost(table["US"].usd_per_acre, False, table["US"].sources)

    def irrigation_share(self, crop: str) -> float:
        """Share of the acres behind the crop's budget that are irrigated: the Census 2022 share
        in the ERS region for an ERS budget (irrigated_shares.csv), 1 or 0 for an extension
        budget of an irrigated or a dryland farm, 0 for the Iowa budgets of costs.csv."""
        return self.wet.get(crop, 0.0)

    def irrigation_cost(self, crop: str, status: str | None = "irrigated") -> Cost:
        """What the field's irrigation adds to the crop's budget: on an irrigated field the
        part of the full cost the budget does not hold, (1 - share) x full; on a dryland field
        minus the part it does hold, -share x full; nothing when the status is unknown, for which
        the budget's own mix is the best guess."""
        full, share = self.irrigation_full_cost(), self.irrigation_share(crop)
        if status == "irrigated":
            return Cost(full.usd_per_acre * (1.0 - share), full.verified, full.sources)
        if status == "dryland":
            return Cost(-full.usd_per_acre * share, full.verified, full.sources)
        return Cost(0.0, True, ())

    def year_index(self, crop: str) -> dict[int, float]:
        """{year: the crop's cost per acre that year in constant dollars}, scaled to mean 1.

        The same convention as the prices (sampler.price_levels): a drawn year's cost and price
        are both that year's real level against the history's mean, so their co-movement is kept
        (expensive fertiliser with high prices in 2008 and 2022) and the mean cost over the
        years is today's budget.

        The field's ERS region where it has the year, else the U.S. total moved to the region's
        level; before 1996 the U.S. historical accounts, chained to the newer series at their
        common years. Empty for a crop ERS does not report (alfalfa, sugarbeets, potatoes)."""
        series = cost_history(COST_SERIES.get(crop, crop))
        if not series:
            return {}
        region = crop_region(crop, self.county, self.region, self.state)[0]
        national = series.get(NATIONAL, {})
        own = series.get(region, {})
        if own and national:
            common = sorted(set(own) & set(national))
            ratio = sum(own[y] for y in common) / sum(national[y] for y in common)
            merged = {y: v * ratio for y, v in national.items()} | own
        else:
            merged = own or national
        if not merged:
            return {}
        mean = sum(merged.values()) / len(merged)
        return {y: v / mean for y, v in merged.items()}


@lru_cache(maxsize=1)
def _irrigated_shares() -> dict[tuple[str, str], float]:
    return {(r["crop"], r["region"]): float(r["share"]) for r in _rows("irrigated_shares.csv")}


def _budget_share(row: dict[str, str]) -> float:
    """Irrigated share of the acres behind a cost row: the row's own `irrigated` flag for an
    extension budget, else the Census share of the ERS row's region (or the U.S.), else 0."""
    if "irrigated" in row:
        return float(_flag(row["irrigated"]))
    shares = _irrigated_shares()
    found = shares.get((row["crop"], row["region"]))
    return found if found is not None else shares.get((row["crop"], NATIONAL), 0.0)


@lru_cache(maxsize=1)
def _irrigation_costs() -> dict[str, Cost]:
    return {
        r["state"]: Cost(float(r["usd_per_acre"]), _flag(r["verified"]), (r["source"],))
        for r in _rows("irrigation_costs.csv")
    }


LAPSED_YEARS = 5  # a region ERS stopped reporting at most this many years before the latest


def _lapsed_regions(region: str, state: str | None, county: str | None) -> dict[str, Cost]:
    """{crop: cost} for crops whose ERS region of the field dropped out of the latest year
    (peanuts and oats in the Prairie Gateway after 2022, sorghum in the Northern Great Plains
    after 2018): the U.S. total of the latest year times the region's mean ratio to the U.S.
    total over its last three years. Derived, so unverified."""
    series: dict[tuple[str, str], dict[int, float]] = {}
    for r in _rows("costs_regional_history.csv"):
        if r["usd_per_acre"]:
            series.setdefault((r["crop"], r["region"]), {})[int(r["year"])] = float(
                r["usd_per_acre"]
            )
    out: dict[str, Cost] = {}
    for (crop, name), own in series.items():
        national = series.get((crop, NATIONAL), {})
        if name != crop_region(crop, county, region, state)[0] or not national:
            continue
        latest = max(national)
        common = sorted(set(own) & set(national))[-3:]
        if max(own) >= latest or max(own) < latest - LAPSED_YEARS or not common:
            continue
        ratio = sum(own[y] for y in common) / sum(national[y] for y in common)
        out[crop] = Cost(
            national[latest] * ratio,
            False,
            (
                f"USDA ERS Commodity Costs and Returns, {crop}, U.S. total {latest} "
                f"({national[latest]:.2f}) times {name}'s ratio to it in "
                f"{common[0]}-{common[-1]} ({ratio:.3f}); ERS last reported {name} in "
                f"{max(own)}",
            ),
        )
    return out


@lru_cache(maxsize=None)
def cost_history(crop: str) -> dict[str, dict[int, float]]:
    """{region: {year: cost per acre without land, in constant dollars}} from the ERS series.

    The U.S. series before 1996 (historical accounts, costs_early_history.csv) is chained to the
    newer one by the ratio of their means over the years both cover, or else at their boundary
    years."""
    from rule_engine.planner.sampler import _cpi  # the CPI table lives with the price history

    cpi = _cpi()
    out: dict[str, dict[int, float]] = {}
    for r in _rows("costs_regional_history.csv"):
        year = int(r["year"])
        if r["crop"] == crop and year in cpi and r["usd_per_acre"]:
            out.setdefault(r["region"], {})[year] = float(r["usd_per_acre"]) / cpi[year]
    early: dict[int, float] = {}
    for r in _rows("costs_early_history.csv"):
        year = int(r["year"])
        if r["crop"] == crop and r["region"] == NATIONAL and year in cpi and r["usd_per_acre"]:
            early[year] = float(r["usd_per_acre"]) / cpi[year]  # already less land
    national = out.get(NATIONAL, {})
    if early and national:
        common = sorted(set(early) & set(national))
        if common:
            ratio = sum(national[y] for y in common) / sum(early[y] for y in common)
        else:
            ratio = national[min(national)] / early[max(early)]
        out[NATIONAL] = {y: v * ratio for y, v in early.items() if y not in national} | national
    elif early:
        out[NATIONAL] = early
    return out


@dataclass(frozen=True)
class Response:
    id: str
    rule: str  # the engine hazard rule whose points this row replaces
    applies_to: str  # crop id
    kind: str  # per_hit | per_unit | per_drought_week | per_d4_week
    loss_low: float
    loss_high: float
    cap: float
    verified: bool
    basis: str
    source: str
    url: str

    @property
    def loss(self) -> float:
        return (self.loss_low + self.loss_high) / 2


def load_responses() -> list[Response]:
    return [
        Response(
            r["id"],
            r["rule"],
            r["applies_to"],
            r["kind"],
            float(r["loss_low"]),
            float(r["loss_high"]),
            float(r["cap"]),
            _flag(r["verified"]),
            r["basis"],
            r["source"],
            r["url"],
        )
        for r in _rows("weather_yield_response.csv")
    ]


def load_adjustments() -> dict[str, dict]:
    return {
        r["id"]: {**r, "value": float(r["value"]), "verified": _flag(r["verified"])}
        for r in _rows("crop_adjustments.csv")
    }


@dataclass(frozen=True)
class CarbonInput:
    dry_matter: float
    shoot_per_harvest_c: float
    root_per_harvest_c: float
    verified: bool
    source: str


def load_carbon_inputs() -> dict[str, CarbonInput]:
    """{crop id or crop group: inputs}; a crop's own row comes before its group's."""
    return {
        r["applies_to"]: CarbonInput(
            float(r["dry_matter"]),
            float(r["shoot_residue_per_harvest_c"]),
            float(r["root_per_harvest_c"]),
            _flag(r["verified"]),
            r["source"],
        )
        for r in _rows("soil_carbon.csv")
    }
