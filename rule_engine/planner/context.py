"""What is fixed for one planning problem: the field, its soil, its known history, its seasons."""

import json
from dataclasses import dataclass, field
from pathlib import Path
from statistics import median

from rule_engine.engine import RotationAdvisor
from rule_engine.facts import HISTORY_WINDOW, crop_history
from rule_engine.summary import SeasonSummary, SeasonSummaryStore


@dataclass(frozen=True)
class FieldContext:
    field: dict  # the engine field record (id, sourceId, countyFips, area in ha, soil, ...)
    region: str
    history: tuple[str, ...]  # catalog crop ids, oldest first, at most HISTORY_WINDOW
    last_history_year: int | None
    history_source: str  # "cdl" (satellite estimate) | "declared" | "none"
    seasons: dict[int, SeasonSummary] = field(default_factory=dict)
    reference_aws_mm: float | None = None  # typical water storage to compare the field against
    gaps: tuple[dict, ...] = ()
    # the first planted year of the plan. Nothing dated after the autumn of plan_year - 1 is
    # used: no season from plan_year on, no marketing-year price after plan_year - 2 (prices.py).
    # None keeps every year (fixtures, exploration).
    plan_year: int | None = None
    # the year whose trend level is the expected yield (default plan_year; a hindcast sets the
    # outcome year so that the drawn yield of that year is its observed yield)
    trend_year: int | None = None

    @property
    def soil(self) -> dict:
        return self.field.get("soil") or {}

    @property
    def irrigation_status(self) -> str | None:
        """ "irrigated" | "dryland" from the satellite irrigation maps, None when not known."""
        return (self.field.get("irrigation") or {}).get("status")

    @property
    def area_acres(self) -> float:
        return float(self.field.get("area") or 0.0) / 0.404686


def read_fields(path: Path | str) -> dict[str, dict]:
    with Path(path).open() as handle:
        return {str(r["id"]): r for r in map(json.loads, handle)}


def state_reference_aws(fields: dict[str, dict]) -> dict[str, float]:
    """Median available water storage (0-100 cm, mm) of the sampled fields in each state."""
    by_state: dict[str, list[float]] = {}
    for record in fields.values():
        value = (record.get("soil") or {}).get("aws_100cm_mm")
        if value is not None and record.get("stateFips"):
            by_state.setdefault(record["stateFips"], []).append(float(value))
    return {state: median(values) for state, values in by_state.items()}


def build_context(
    record: dict,
    advisor: RotationAdvisor,
    summary_roots: list[Path | str] = (),
    reference_aws_mm: float | None = None,
    plan_year: int | None = None,
    trend_year: int | None = None,
) -> FieldContext:
    region, gaps = advisor.region_for(record)
    seasons: dict[int, SeasonSummary] = {}
    csbid, county = record.get("sourceId"), record.get("countyFips")
    for root in summary_roots:
        if csbid and county:
            for season in SeasonSummaryStore(root).seasons(str(csbid), str(county)):
                if plan_year is None or season.year < plan_year:
                    seasons[season.year] = season
    ordered = [seasons[y] for y in sorted(seasons)]
    history = [y for y in crop_history(record, ordered, advisor.catalog) if y.crop]
    if not seasons:
        gaps = gaps + [{"code": "no_season_summary", "affects": ["weather", "yield"]}]
    if not history:
        gaps = gaps + [{"code": "no_crop_history"}]
    return FieldContext(
        field=record,
        region=region,
        history=tuple(y.crop for y in history[-HISTORY_WINDOW:]),
        last_history_year=history[-1].year if history else None,
        history_source=history[-1].source if history else "none",
        seasons=seasons,
        reference_aws_mm=reference_aws_mm,
        gaps=tuple(gaps),
        plan_year=plan_year,
        trend_year=trend_year,
    )
