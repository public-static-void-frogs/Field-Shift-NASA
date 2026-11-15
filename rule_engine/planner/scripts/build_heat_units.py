"""Heat needed from planting to maturity, per crop and state, for the weekly planner.

    python rule_engine/planner/scripts/build_heat_units.py \
        --gridmet data/local/usa_sample_v2/work/gridmet

For each crop, state and season since 2020 it takes the day half the crop was planted, mature
and harvested (USDA NASS Crop Progress, weekly, state level) and sums the growing degree days
between planting and maturity from the state's daily weather: the mean over the sample fields of
that state in the gridMET parquet files. Where NASS reports no maturity stage for a crop,
maturity is the harvest day.

Writes rule_engine/planner/data/crop_heat_units.csv: the median over seasons of the planting,
maturity and harvest days, the days and the degree days between planting and maturity, and the
error of both ways of predicting maturity (a fixed number of days, a fixed heat sum) when each
season is predicted from the others. `method` names the one with the smaller error in that state:
late in a cool autumn the heat sum grows slowly and misses by weeks. Needs USDA_DATA_KEY in .env or the environment; raw
responses and the state weather are cached under --cache.
"""

import argparse
import contextlib
import csv
import io
import json
import statistics
import sys
from datetime import date
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "rule_engine" / "scripts"))
from fetch_nass_reference import _key  # noqa: E402
from fetch_state_reference import _crossing, _get, _number  # noqa: E402

FIRST_YEAR = 2020
OUT = ROOT / "rule_engine/planner/data/crop_heat_units.csv"
# crop -> (commodity, class or None, base temperature C, maturity unit or None). Base
# temperatures: 10 C for the warm-season grains and peanuts, 15.6 C (60 F) for cotton, 7 C for
# potatoes, 1.1 C (34 F) for sugarbeets, 0 C for the small grains, pulses and flax. NASS has no
# Crop Progress series for chickpeas: the weekly planner gives them the lentil row (weekly.py).
CROPS = {
    "corn": ("CORN", None, 10.0, "MATURE"),
    "soybeans": ("SOYBEANS", None, 10.0, "DROPPING LEAVES"),
    "sorghum": ("SORGHUM", None, 10.0, "MATURE"),
    "oats": ("OATS", None, 0.0, None),
    "barley": ("BARLEY", None, 0.0, None),
    "spring_wheat": ("WHEAT", "SPRING, (EXCL DURUM)", 0.0, None),
    "winter_wheat": ("WHEAT", "WINTER", 0.0, None),
    "durum_wheat": ("WHEAT", "SPRING, DURUM", 0.0, None),
    "cotton": ("COTTON", "UPLAND", 15.6, "BOLLS OPENING"),
    "peanuts": ("PEANUTS", None, 10.0, "DUG"),  # dug at maturity, threshed after curing
    "rice": ("RICE", None, 10.0, "MATURE"),
    "millet": ("MILLET", "PROSO", 10.0, None),
    "sugarbeets": ("SUGARBEETS", None, 1.1, None),
    "potatoes": ("POTATOES", None, 7.0, "VINES DRY"),
    "dry_peas": ("PEAS", "DRY EDIBLE", 0.0, "DROPPING LEAVES"),
    "lentils": ("LENTILS", None, 0.0, None),
    "flax": ("FLAXSEED", None, 0.0, None),
}
CAP_C = 30.0
STATE_FIPS = {
    "01": "AL", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE",
    "12": "FL", "13": "GA", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS",
    "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ",
    "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR",
    "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY",
}  # fmt: skip


def progress(key: str, crop: str, cache: Path) -> list[dict]:
    path = cache / f"progress_{crop}.json"
    if path.exists():
        return json.loads(path.read_text())
    commodity, klass, _, _ = CROPS[crop]
    query = {
        "commodity_desc": commodity,
        "statisticcat_desc": "PROGRESS",
        "freq_desc": "WEEKLY",
        "year__GE": str(FIRST_YEAR),
    }
    if klass:
        query["class_desc"] = klass
    keep = ("state_alpha", "year", "unit_desc", "week_ending", "Value")
    # _get prints the whole query, key included, when NASS refuses it: keep that off the screen
    with contextlib.redirect_stdout(io.StringIO()):
        found = _get(key, **query)
    if not found:
        print(f"  NASS returned no progress rows for {crop}")
    # harvest of the grain crop only: corn and sorghum silage are reported under the same unit
    rows = [
        {k: r.get(k) for k in keep} for r in found if "SILAGE" not in (r.get("short_desc") or "")
    ]
    if rows:
        path.write_text(json.dumps(rows))
    return rows


def stage_days(rows: list[dict], maturity_unit: str | None) -> dict[tuple[str, int], dict]:
    """(state, crop year) -> {stage: day counted from 1 January of the harvest year}.

    A crop planted the autumn before has a planting day below 1."""
    units = {"PLANTED": "planted", "HARVESTED": "harvested"}
    if maturity_unit:
        units[maturity_unit] = "mature"
    series: dict[tuple, list[tuple[int, float]]] = {}
    for row in rows:
        unit = (row["unit_desc"] or "").replace("PCT ", "")
        value = _number(row["Value"] or "")
        if unit not in units or value is None or not row.get("week_ending"):
            continue
        year = int(row["year"])
        day = (date.fromisoformat(row["week_ending"]) - date(year, 1, 1)).days + 1
        series.setdefault((row["state_alpha"], year, units[unit]), []).append((day, value))
    found: dict[tuple[str, int], dict] = {}
    for (state, year, stage), points in series.items():
        day = _crossing(points)
        if day is not None:
            found.setdefault((state, year), {})[stage] = day
    for stages in found.values():
        stages.setdefault("mature", stages.get("harvested"))
    return found


def state_heat(gridmet: Path, cache: Path) -> dict[tuple[str, float], dict[date, float]]:
    """(state, base C) -> {day: growing degree days}, mean over the state's sample fields.

    The same formula as weekly.DailyWeather.heat: the daily maximum and minimum are capped at
    CAP_C, the minimum is raised to the base, and the mean minus the base counts when positive."""
    bases = sorted({base for _, _, base, _ in CROPS.values()})
    names = {base: "gdd_" + f"{base:g}".replace(".", "_") for base in bases}
    path = cache / f"state_heat_{'_'.join(names[b][4:] for b in bases)}.parquet"
    con = duckdb.connect()
    con.execute("SET memory_limit='3GB'; SET threads=4")
    if not path.exists():
        files = [str(p) for p in sorted(gridmet.glob("*.parquet")) if int(p.stem) >= FIRST_YEAR - 1]
        sums = ",\n".join(
            f"avg(greatest(0, (least(gridmet_tmax_c, {CAP_C}) + greatest(least(gridmet_tmin_c, "
            f"{CAP_C}), {base})) / 2 - {base})) AS {names[base]}"
            for base in bases
        )
        con.execute(
            f"""COPY (
                SELECT substr(CSBID, 1, 2) AS state_fips, year, doy, {sums}
                FROM read_parquet({files!r})
                GROUP BY ALL
            ) TO '{path}' (FORMAT parquet)"""
        )
    heat: dict[tuple[str, float], dict[date, float]] = {}
    columns = ", ".join(names[b] for b in bases)
    query = f"SELECT state_fips, year, doy, {columns} FROM read_parquet('{path}')"
    for fips, year, doy, *values in con.execute(query).fetchall():
        state = STATE_FIPS.get(fips)
        if state is None:
            continue
        day = date.fromordinal(date(year, 1, 1).toordinal() + doy - 1)
        for base, value in zip(bases, values, strict=True):
            heat.setdefault((state, base), {})[day] = value
    return heat


def _day(year: int, number: float) -> date:
    return date.fromordinal(date(year, 1, 1).toordinal() + round(number) - 1)


def heat_between(heat: dict[date, float], start: date, end: date) -> float | None:
    days = [date.fromordinal(o) for o in range(start.toordinal(), end.toordinal())]
    if not days or any(day not in heat for day in days):
        return None
    return sum(heat[day] for day in days)


def day_reached(heat: dict[date, float], start: date, need: float) -> int | None:
    """Days after `start` when the heat sum reaches `need`."""
    total, day = 0.0, start
    for count in range(1, 420):
        if day not in heat:
            return None
        total += heat[day]
        if total >= need:
            return count
        day = date.fromordinal(day.toordinal() + 1)
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--gridmet", type=Path, required=True)
    parser.add_argument("--cache", type=Path, default=ROOT / "data/local/planner/heat_units")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    heat = state_heat(args.gridmet, args.cache)
    key = None
    out = []
    for crop, (_, _, base, maturity_unit) in CROPS.items():
        if not (args.cache / f"progress_{crop}.json").exists():
            key = key or _key()
        stages = stage_days(progress(key, crop, args.cache), maturity_unit)
        seasons: dict[str, list[dict]] = {}
        for (state, year), found in sorted(stages.items()):
            if found.get("planted") is None or found.get("mature") is None:
                continue
            if found["mature"] <= found["planted"] or (state, base) not in heat:
                continue
            start, end = _day(year, found["planted"]), _day(year, found["mature"])
            total = heat_between(heat[(state, base)], start, end)
            if total is None:
                continue
            seasons.setdefault(state, []).append(
                {**found, "year": year, "start": start, "days": (end - start).days, "gdd": total}
            )
        errors = {"days": [], "gdd": [], "chosen": []}
        for state, rows in sorted(seasons.items()):
            by_days, by_heat = [], []
            for row in rows:  # each season predicted from the other seasons of the state
                others = [r for r in rows if r is not row]
                if len(others) < 2:
                    continue
                by_days.append(abs(statistics.median(r["days"] for r in others) - row["days"]))
                need = statistics.median(r["gdd"] for r in others)
                reached = day_reached(heat[(state, base)], row["start"], need)
                if reached is not None:
                    by_heat.append(abs(reached - row["days"]))
            errors["days"] += by_days
            errors["gdd"] += by_heat
            # the heat sum is used where it predicted the state's seasons at least as well
            by_heat_wins = len(by_heat) == len(by_days) > 0 and statistics.mean(
                by_heat
            ) <= statistics.mean(by_days)
            errors["chosen"] += by_heat if by_heat_wins else by_days
            harvest = [r["harvested"] - r["mature"] for r in rows if r.get("harvested")]
            out.append(
                {
                    "region": state,
                    "crop": crop,
                    "plant_doy": round(statistics.median(r["planted"] for r in rows)),
                    "mature_doy": round(statistics.median(r["mature"] for r in rows)),
                    "harvest_lag_days": round(statistics.median(harvest)) if harvest else 0,
                    "days_to_maturity": round(statistics.median(r["days"] for r in rows)),
                    "gdd_to_maturity": round(statistics.median(r["gdd"] for r in rows)),
                    "base_c": base,
                    "cap_c": CAP_C,
                    "method": "heat" if by_heat_wins else "days",
                    "maturity_stage": (maturity_unit or "HARVESTED").lower(),
                    "seasons": len(rows),
                    "mae_days_fixed": round(statistics.mean(by_days), 1) if by_days else "",
                    "mae_days_heat": round(statistics.mean(by_heat), 1) if by_heat else "",
                    "source": "USDA NASS Crop Progress, state weekly, day 50% reached, "
                    f"{rows[0]['year']}-{rows[-1]['year']}; gridMET daily temperature",
                    "as_of": date.today().isoformat(),
                }
            )
        summary = {k: round(statistics.mean(v), 1) if v else None for k, v in errors.items()}
        print(f"{crop}: {len(seasons)} states, {sum(map(len, seasons.values()))} seasons, "
              f"maturity error in days: fixed days {summary['days']}, heat sum {summary['gdd']}, "
              f"better of the two per state {summary['chosen']}",
              flush=True)  # fmt: skip
    with OUT.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(out[0]))
        writer.writeheader()
        writer.writerows(out)
    print(f"wrote {len(out)} rows to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
