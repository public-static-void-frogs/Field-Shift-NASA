"""Whether a field is irrigated, and what that does to its yields.

Status per field (`field_status`) comes from the yearly 30 m maps fetched by
scripts/fetch_irrigation.py: IrrMapper v1.2 in the eleven western states, where it is the newer
and finer map, else LANID-US. Both are Landsat classifications, not farmer records. The field is
"irrigated" when the pixel at its centroid is irrigated in at least half of the last RECENT
years the map has, "dryland" otherwise.

Yields (`practice_ratios`): NASS publishes state yields of irrigated and of non-irrigated acres
for some crops and states (kinds yield_irrigated and yield_dryland in
data/nass_long_history.csv). A field's yield is the all-practice yield the sampler draws times
the state's ratio of the field's practice to all practices, that year's ratio where NASS has
it, else the mean ratio. Where NASS has no split for the crop and state the yield is left as it
is and the gap is reported. An irrigated field does not take the modelled drought loss.
"""

from functools import lru_cache

RECENT = 5
PRACTICE_KIND = {"irrigated": "yield_irrigated", "dryland": "yield_dryland"}
SOURCES = ("IrrMapper-v1.2", "LANID-US")  # preferred first


def field_status(frame) -> dict[str, dict]:
    """{field id: {"status", "share", "source", "years"}} from the fetch_irrigation table."""
    out: dict[str, dict] = {}
    frame = frame[frame["irrigated"].notna()]
    for source in SOURCES:
        part = frame[frame["source"] == source].sort_values("year")
        recent = part.groupby("field_id").tail(RECENT).groupby("field_id")
        table = recent.agg(share=("irrigated", "mean"), first=("year", "min"), last=("year", "max"))
        for field_id, row in table.iterrows():
            out.setdefault(
                str(field_id),
                {
                    "status": "irrigated" if row["share"] >= 0.5 else "dryland",
                    "share": round(float(row["share"]), 2),
                    "source": source,
                    "years": [int(row["first"]), int(row["last"])],
                },
            )
    return out


@lru_cache(maxsize=1)
def _state_yields() -> dict[tuple[str, str, str], dict[int, float]]:
    """State yields by (kind, crop, state); the first file holding a series defines it.

    The practice splits are in the planner's long history; the all-practice yields of corn and
    soybeans only in the rule engine's reference history (the sampler reads both, in that order).
    """
    from rule_engine.planner.sampler import _history_rows

    out: dict[tuple[str, str, str], dict[int, float]] = {}
    owner: dict[tuple[str, str, str], tuple[str, str]] = {}
    for r in _history_rows():
        if r["kind"] not in ("yield", *PRACTICE_KIND.values()) or r["geography"] == "US":
            continue
        key = (r["kind"], r["crop"], r["geography"])
        series = (r["unit"], r.get("nass_short_desc") or "")
        if owner.setdefault(key, series) == series:
            out.setdefault(key, {})[int(r["year"])] = float(r["value"])
    return out


def practice_ratios(crop: str, state: str, status: str | None):
    """({year: practice yield / all-practice yield}, mean ratio), or None without a split."""
    kind = PRACTICE_KIND.get(status or "")
    if kind is None:
        return None
    yields = _state_yields()
    split, every = yields.get((kind, crop, state)), yields.get(("yield", crop, state))
    if not split or not every:
        return None
    ratios = {y: split[y] / every[y] for y in split if every.get(y)}
    if not ratios:
        return None
    return ratios, sum(ratios.values()) / len(ratios)
