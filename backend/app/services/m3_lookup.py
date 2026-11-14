#!/usr/bin/env python3
"""M3 advice for a coordinate (backend lookup, no network, no model run at request time).

    from m3_lookup import m3_advice
    d = m3_advice(41.98, -93.62, out_dir="./m3_out")          # or set env M3_OUT once;  plain python dict, JSON-safe (NaN -> None)
    d["ok"], d["match"], d["windows"]["now"]["corn:sow"], d["risk"]["now"]["corn"], d["fallow_zero"]["after_corn"]

How it works: m3_window_forecaster.py is run OFFLINE (a batch job) and writes parquet tables (see FILES below). This module only
reads them once (cached in memory, thread-safe) and answers "what applies at this coordinate": nearest FIELD centroid within
FIELD_RADIUS_KM, else the weather CELL containing / nearest to the point within CELL_RADIUS_KM, else ok=False. Re-run the batch job and call
reload() (or restart) to publish new numbers.

FILES read from <out_dir>   (R = required, O = optional; a missing optional file only removes that block, listed in meta["missing_files"])
  field_index.parquet                         R  CSBID, cell_id, lat, lon, county_fips, unit_id, awc_bin_mm, aws_filled   -> coordinate -> field / cell / soil unit
  chronoshift/windows_cell.parquet            R  event windows q10/q50/q90 by cell, period (now|2040), scenario, model, method, selected
  chronoshift/risk_cell.parquet               R  heat / frost risk, adaptation margin, workable days by cell, crop, period, scenario, model
  chronoshift/risk_2040_across_models.parquet O  2040 risk range across climate models (cell, crop, scenario)
  chronoshift/delay_scan_cell.parquet         O  risk versus sowing delay (only with include_delay_scan=True)
  chronoshift/validation_nass.csv             O  held-out NASS errors -> meta["nass_validation_mae_days"]
  fallow_zero/fallow_zero_units.parquet       O  water at sowing, shortfall probabilities, safe autumn rain (cell x soil-water bin x after_crop x branch)
  fallow_zero/fallow_zero_m9_units.parquet    O  m9 cover-crop water risk and OK flag per unit
  fallow_zero/fallow_zero_field_metrics.parquet O  the same flags per field (CSBID)
  fallow_zero/ledger_calibration.json         O  how the water ledger was calibrated -> meta["fallow_zero_calibration"]
HOW TO READ THE OUTPUT
  Always check first:  d["ok"]  (False -> d["error"]["code"]: "outside_coverage" | "bad_input"),  d["match"]["level"]  ("field" = values
  for that field; "cell" = values for the ~50 km weather cell, no field-specific soil), and d["warnings"] (show these to the user).
  Missing values are None, never NaN. Day numbers are 1-based days of a 365-day year (Feb 29 dropped); dates are "MM-DD" without a year.

  windows  - WHEN things happen. Every entry is a distribution over years, not a forecast for one day:
      date_q10 / date_q50 / date_q90 = the date that 10% / 50% / 90% of years reach (q10 = early year, q50 = typical, q90 = late year).
      Use q50 as "typical" and q10..q90 as the usual range - 80% of years fall inside it.
      Events: last_spring_frost, first_autumn_frost (daily minimum <= 0 C);  <crop>:first_ready = first workable sowing day (warm enough:
      5-day mean >= 10 C, and dry: <= 2 mm today and <= 12 mm in 3 days, on >= 3 of the next 5 days, inside the crop's planting-date limits);
      <crop>:sow = typical sowing = first_ready + a sowing lag calibrated on NASS (default 7 d); <crop>:flower and <crop>:mature = degree-day
      dates counted from sowing (constants calibrated on NASS).
      windows.now      : today's climate (recent years), "method" = the quantile model chosen on held-out years (climatology | trend | lgbm).
      windows.future   : 2040 by scenario (ssp245 = middle, ssp585 = high emissions), median and min..max of the q50 over climate models;
                         it is the model spread, not a probability. n_models says how many models stand behind it.
      Trust it less when: n_years_fit < 15, calibrated is false (default degree-day constants, no NASS), or censored_share > 0.2 for the frost events.

  risk  - HOW RISKY a sowing at the typical date is (per crop; sowing delay 0):
      p_heat_overlap  = share of years with >= 2 days at >= 35 C in the flowering window; p_heat_lo80..hi80 = its 80% sampling interval
                        (wide interval = few years). mean_heat_days_in_window = average number of such days.
      p_frost_before_maturity = share of years in which the first autumn frost comes before the crop matures.
      flag_vulnerable_m5 = p_heat_overlap >= 0.40 (the proposal's threshold; change heat_limit in M3 to move it).
      adaptation_margin_days = how many days sowing can be postponed (steps of 5 d, up to 30) before frost risk exceeds 10% or heat risk
                        rises by more than 5 points. 0 = no room; 30 = flexible. None = even the typical date already has > 10% frost risk
                        before maturity (or too little data) - read it as "no safe delay", not "unknown, ignore".
      workable_days_q10/q50/q90 = number of workable days in the planting window; low values mean wet springs and a narrow sowing window.
      risk.future = the same for 2040 as ranges over models (p_heat_min / median / max, margin_min / max). Compare with risk.now:
      a rise in p_heat or a fall in margin is the climate signal. delay_scan (optional) gives the whole risk-versus-delay curve behind the margin.

  fallow_zero  - WATER AT SOWING of the next crop, per preceding crop (after_corn -> soybeans, after_soybeans -> corn), two branches:
      bare  = fallow after harvest;  cover = a winter rye cover crop that uses water until terminated before sowing.
      paw_sow_mm (q10/q50/q90) = plant-available water in the root zone at sowing, mm;  paw_sow_frac_q50 = the median as a share of the soil's
      capacity (awc_mm).  p_shortfall = share of years in which it is below shortfall_threshold_mm (50% of capacity), with an 80% interval.
      m9_cover_water_risk = p_shortfall of the cover branch;  cover_ok = it is <= 0.30 (proposal rule: a cover crop is "water-safe").
      delta_p_cover_minus_bare = the extra shortfall probability caused by the cover crop - the real cost of covering.
      safe_autumn_rain_mm (cover branch only) = autumn rain (harvest to freeze-up) at or above which the shortfall probability falls to <= 0.30:
      a practical trigger ("cover only if autumn rain >= X mm so far"). 0 = safe whatever the rain; None = no such level found, or the bare branch.
      autumn_rain_mm = the usual autumn rain (q10/q50/q90) to compare it with.
      ledger_band_mm = typical error of the water ledger; if shortfall flips when you shift by this band, treat the answer as uncertain.
      field_level = the same flags for exactly this field (only when match.level == "field").
      Treat Fallow-Zero as indicative while warnings mention "plain water ledger" or few SMAP seasons: it is validated on April/October
      bare-soil days only, winter behaviour (frozen soil, snow) is not.

  meta  - nass_validation_mae_days = mean absolute error (days) of the model's sowing / flowering / maturity dates on held-out NASS years;
      if it is more than ~5-7 days, show the windows as approximate. missing_files lists optional tables that were not found.

  Typical use:  sowing advice -> windows.now[crop:sow] (q50, q10..q90) + risk.now[crop].adaptation_margin_days;  heat warning ->
  flag_vulnerable_m5 and risk.future;  cover-crop go / no-go -> fallow_zero.after_<crop>.cover_ok, with safe_autumn_rain_mm as the condition.
  Do not present q-values as exact dates; present "typically around <q50>, usually between <q10> and <q90>".
Python deps: numpy, pandas, pyarrow.  Nothing else (no rasterio, no requests, no credentials).
"""
import argparse
import datetime as dt
import json
import math
import os
import threading
from pathlib import Path

import numpy as np
import pandas as pd

FIELD_RADIUS_KM = 1.0          # a point this close to a field centroid is treated as "that field"
CELL_RADIUS_KM = 45.0          # POWER cell is ~0.5 x 0.625 deg: farther than this from every cell centre = outside coverage
MIN_YEARS_WARN = 15
CENSOR_WARN = 0.2
_BASE = dt.date(2001, 1, 1)    # the model uses a 365-day calendar; day numbers are 1-based
SPLIT_EVENTS = {"corn:sow": ("corn", "sow"), "soybeans:sow": ("soybeans", "sow")}


def _doy_to_md(doy):
    return None if doy is None or not np.isfinite(doy) else (_BASE + dt.timedelta(days=int(round(doy)) - 1)).strftime("%m-%d")


def _py(v):
    """numpy / pandas scalar -> JSON-safe python (NaN, NaT, inf -> None)."""
    if v is None:
        return None
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        return float(v) if math.isfinite(v) else None
    if isinstance(v, (pd.Timestamp, dt.datetime, dt.date)):
        return v.isoformat()
    if v is pd.NA or (isinstance(v, str) and v == "nan"):
        return None
    return v


def _row(r, drop=()):
    return {k: _py(v) for k, v in r.items() if k not in drop}


def _hav_km(lat, lon, lats, lons):
    p = np.pi / 180
    a = np.sin((lats - lat) * p / 2) ** 2 + np.cos(lat * p) * np.cos(lats * p) * np.sin((lons - lon) * p / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(a))


class M3Advice:
    def __init__(self, out_dir):
        self.out = Path(out_dir)
        self._lock = threading.Lock()
        self._loaded = False

    # -------------------------------------------------------------- loading
    def reload(self):
        with self._lock:
            self._loaded = False
        self._ensure()

    def _read(self, rel, required=False):
        f = self.out / rel
        if not f.exists():
            if required:
                raise FileNotFoundError(f"M3 output missing: {f}")
            self.missing.append(rel)
            return None
        return pd.read_csv(f) if f.suffix == ".csv" else pd.read_parquet(f)

    def _ensure(self):
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            self.missing = []
            fi = self._read("field_index.parquet", True)
            win = self._read("chronoshift/windows_cell.parquet", True)
            rk = self._read("chronoshift/risk_cell.parquet", True)
            self.fi = fi.reset_index(drop=True)
            self.fi_lat, self.fi_lon = self.fi["lat"].to_numpy(float), self.fi["lon"].to_numpy(float)
            self.fi_by_csbid = self.fi.set_index("CSBID")
            ids = sorted(set(win["cell_id"]) & set(rk["cell_id"]))
            ll = pd.Series(ids).str.split("_", expand=True).astype(float)
            self.cell_ids, self.cell_lat, self.cell_lon = ids, ll[0].to_numpy(), ll[1].to_numpy()
            self.win = {c: g for c, g in win.groupby("cell_id")}
            self.risk = {c: g for c, g in rk.groupby("cell_id")}
            r40 = self._read("chronoshift/risk_2040_across_models.parquet")
            self.risk40 = {c: g for c, g in r40.groupby("cell_id")} if r40 is not None else {}
            ds = self._read("chronoshift/delay_scan_cell.parquet")
            self.delay = {c: g for c, g in ds.groupby("cell_id")} if ds is not None else {}
            u = self._read("fallow_zero/fallow_zero_units.parquet")
            self.units = {k: g for k, g in u.groupby("unit_id")} if u is not None else {}
            self.units_by_cell = {}
            if u is not None:
                for c, g in u.groupby("cell_id"):
                    self.units_by_cell[c] = g.groupby("unit_id")["n_fields"].max().sort_values(ascending=False).index.tolist()
            m9 = self._read("fallow_zero/fallow_zero_m9_units.parquet")
            self.m9 = {k: g for k, g in m9.groupby("unit_id")} if m9 is not None else {}
            fm = self._read("fallow_zero/fallow_zero_field_metrics.parquet")
            self.fmet = fm.set_index("CSBID") if fm is not None else None
            val = self._read("chronoshift/validation_nass.csv")
            self.nass_mae = {}
            if val is not None and len(val):
                for (c, s), g in val.groupby(["crop", "stage"]):
                    self.nass_mae.setdefault(c, {})[s] = _py(float(g["error_days"].abs().mean()))
            lc = self.out / "fallow_zero/ledger_calibration.json"
            self.ledger = json.loads(lc.read_text()) if lc.exists() else None
            self._loaded = True

    # -------------------------------------------------------------- matching
    def _match(self, lat, lng):
        d = _hav_km(lat, lng, self.fi_lat, self.fi_lon)
        i = int(np.argmin(d))
        if d[i] <= FIELD_RADIUS_KM:
            r = self.fi.iloc[i]
            return dict(level="field", csbid=str(r["CSBID"]), cell_id=str(r["cell_id"]), unit_id=r.get("unit_id"),
                        county_fips=r.get("county_fips"), state=r.get("state"), distance_km=round(float(d[i]), 3),
                        field_lat=_py(r["lat"]), field_lon=_py(r["lon"]), awc_mm=_py(r.get("aws_filled", r.get("aws_mm"))),
                        awc_bin_mm=_py(r.get("awc_bin_mm"))), None
        dc = _hav_km(lat, lng, self.cell_lat, self.cell_lon)
        j = int(np.argmin(dc))
        if dc[j] <= CELL_RADIUS_KM:
            cid = self.cell_ids[j]
            units = self.units_by_cell.get(cid, [])
            return dict(level="cell", csbid=None, cell_id=cid, unit_id=units[0] if units else None, county_fips=None, state=None,
                        distance_km=round(float(dc[j]), 3), field_lat=None, field_lon=None, awc_mm=None, awc_bin_mm=None), None
        return None, dict(code="outside_coverage", nearest_cell=self.cell_ids[j], nearest_cell_km=round(float(dc[j]), 1),
                          nearest_field_km=round(float(d[i]), 1))

    # -------------------------------------------------------------- blocks
    def _windows(self, cid):
        w = self.win[cid]
        keys = ["period", "scenario", "model", "event"]
        pick = w.sort_values("selected", ascending=False).drop_duplicates(keys)      # chosen model of the cell, else the first row
        now = {}
        for _, r in pick[pick["period"] == "now"].iterrows():
            now[r["event"]] = dict(date_q10=r["date_q10"], date_q50=r["date_q50"], date_q90=r["date_q90"],
                                   doy_q10=_py(r["q10"]), doy_q50=_py(r["q50"]), doy_q90=_py(r["q90"]), method=r["method"],
                                   n_years_fit=_py(r["n_years_fit"]), censored_share=_py(r["censored_share"]),
                                   calibrated=_py(r["calibrated"]))
        fut = {}
        for (scen, ev), g in pick[pick["period"] != "now"].groupby(["scenario", "event"]):
            q = g["q50"].to_numpy(float)
            fut.setdefault(scen, {})[ev] = dict(
                doy_q50_median=_py(float(np.nanmedian(q))), doy_q50_min=_py(float(np.nanmin(q))), doy_q50_max=_py(float(np.nanmax(q))),
                date_q50_median=_doy_to_md(float(np.nanmedian(q))), date_q10_median=_doy_to_md(float(np.nanmedian(g["q10"]))),
                date_q90_median=_doy_to_md(float(np.nanmedian(g["q90"]))), n_models=int(g["model"].nunique()),
                target_year=_py(g["target_year"].iloc[0]) if "target_year" in g else None)
        return dict(now=now, future=fut)

    def _risk(self, cid):
        r = self.risk[cid]
        now = {c: _row(g.iloc[0], drop=("cell_id", "crop", "period", "scenario", "model")) for c, g in
               r[(r["period"] == "now") & (r["scenario"] == "obs")].groupby("crop")}
        fut = {}
        if cid in self.risk40:
            for (scen, crop), g in self.risk40[cid].groupby(["scenario", "crop"]):
                fut.setdefault(scen, {})[crop] = _row(g.iloc[0], drop=("cell_id", "crop", "scenario"))
        else:
            for (scen, crop), g in r[r["period"] != "now"].groupby(["scenario", "crop"]):
                fut.setdefault(scen, {})[crop] = dict(p_heat_median=_py(g["p_heat_overlap"].median()), p_heat_min=_py(g["p_heat_overlap"].min()),
                                                      p_heat_max=_py(g["p_heat_overlap"].max()), margin_min=_py(g["adaptation_margin_days"].min()),
                                                      margin_max=_py(g["adaptation_margin_days"].max()), n_models=int(g["model"].nunique()))
        return dict(now=now, future=fut)

    def _delay(self, cid):
        d = self.delay.get(cid)
        if d is None:
            return None
        out = {}
        for (per, scen, crop), g in d[d["model"].isin(["obs"]) | (d["period"] != "now")].groupby(["period", "scenario", "crop"]):
            g = g.groupby("delay_days", as_index=False)[["p_heat_overlap", "p_frost_before_maturity"]].median()
            out.setdefault(per, {}).setdefault(scen, {})[crop] = [dict(delay_days=int(r.delay_days), p_heat=_py(r.p_heat_overlap),
                                                                        p_frost=_py(r.p_frost_before_maturity)) for r in g.itertuples()]
        return out

    def _fallow(self, m):
        uid, csbid = m["unit_id"], m["csbid"]
        if uid not in self.units:
            return None
        u = self.units[uid]
        out = {}
        for after, g in u.groupby("after_crop"):
            blk = dict(next_crop=g["next_crop"].iloc[0], awc_mm=_py(g["awc_mm"].iloc[0]), harvest_doy=_py(g["harvest_doy"].iloc[0]))
            for br, gb in g.groupby("branch"):
                r = gb.iloc[0]
                blk[br] = dict(paw_sow_mm=dict(q10=_py(r["paw_sow_q10_mm"]), q50=_py(r["paw_sow_q50_mm"]), q90=_py(r["paw_sow_q90_mm"])),
                               paw_sow_frac_q50=_py(r["paw_sow_frac_q50"]), p_shortfall=_py(r["p_shortfall"]),
                               p_shortfall_lo80=_py(r["p_shortfall_lo80"]), p_shortfall_hi80=_py(r["p_shortfall_hi80"]),
                               shortfall_threshold_mm=_py(r["shortfall_threshold_mm"]), ledger_band_mm=_py(r["ledger_band_mm"]),
                               safe_autumn_rain_mm=_py(r["safe_autumn_rain_mm"]),
                               autumn_rain_mm=dict(q10=_py(r["autumn_rain_q10_mm"]), q50=_py(r["autumn_rain_q50_mm"]), q90=_py(r["autumn_rain_q90_mm"])),
                               n_years=_py(r["n_years"]), residual_model=_py(r["residual_model"]))
            mm = self.m9.get(uid)
            if mm is not None:
                x = mm[mm["after_crop"] == after]
                if len(x):
                    x = x.iloc[0]
                    blk["m9_cover_water_risk"] = _py(x["m9_cover_water_risk"])
                    blk["delta_p_cover_minus_bare"] = _py(x["delta_p_cover_minus_bare"])
                    blk["cover_ok"] = _py(x["flag_cover_ok_m9"])
            out[f"after_{after}"] = blk
        if csbid is not None and self.fmet is not None and csbid in self.fmet.index:
            out["field_level"] = _row(self.fmet.loc[csbid], drop=("county_fips", "cell_id", "smap_cell_id", "unit_id", "awc_bin_mm"))
        return out

    def _quality(self, m, windows, risk, fz):
        q = []
        if m["level"] == "cell":
            q.append("no field within %.1f km: values are for the weather cell; soil water capacity (Fallow-Zero) is the cell's largest unit" % FIELD_RADIUS_KM)
        for ev, w in windows["now"].items():
            if (w["n_years_fit"] or 99) < MIN_YEARS_WARN:
                q.append(f"{ev}: fitted on only {int(w['n_years_fit'])} years")
            if (w["censored_share"] or 0) > CENSOR_WARN and ev in ("last_spring_frost", "first_autumn_frost"):
                q.append(f"{ev}: {w['censored_share']:.0%} of years censored by the data window")
        if fz is not None and self.ledger is not None:
            if not self.ledger.get("use_corrector", False):
                q.append("Fallow-Zero uses the plain water ledger (no learned residual correction)")
            for n in self.ledger.get("notes", []):
                q.append("Fallow-Zero: " + n)
            if self.ledger.get("years") and len(self.ledger["years"]) < 5:
                q.append(f"Fallow-Zero ledger calibrated on {len(self.ledger['years'])} SMAP seasons")
        return q

    # -------------------------------------------------------------- public
    def lookup(self, lat, lng, include_delay_scan=False):
        self._ensure()
        try:
            lat, lng = float(lat), float(lng)
        except (TypeError, ValueError):
            return dict(ok=False, error=dict(code="bad_input", detail="lat/lng must be numbers"))
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return dict(ok=False, error=dict(code="bad_input", detail="lat/lng out of range"))
        m, err = self._match(lat, lng)
        res = dict(ok=m is not None, query=dict(lat=lat, lng=lng))
        if m is None:
            res["error"] = err
            return res
        cid = m["cell_id"]
        windows, risk = self._windows(cid), self._risk(cid)
        fz = self._fallow(m)
        res.update(match=m, windows=windows, risk=risk, fallow_zero=fz)
        if include_delay_scan:
            res["delay_scan"] = self._delay(cid)
        res["meta"] = dict(source_dir=str(self.out), missing_files=list(self.missing), nass_validation_mae_days=self.nass_mae or None,
                           fallow_zero_calibration=None if self.ledger is None else
                           {k: self.ledger.get(k) for k in ("kc_bare", "hs_scale", "use_corrector", "band_mm", "years") if k in self.ledger},
                           day_numbers="1-based day of a 365-day year (Feb 29 dropped); dates are MM-DD")
        res["warnings"] = self._quality(m, windows, risk, fz)
        return res


_CACHE = {}


def m3_advice(lat, lng, out_dir=None, include_delay_scan=False):
    """Convenience wrapper with a per-directory cache. out_dir defaults to env M3_OUT."""
    out_dir = out_dir or os.environ.get("M3_OUT")
    if not out_dir:
        raise ValueError("pass out_dir or set env M3_OUT")
    if out_dir not in _CACHE:
        _CACHE[out_dir] = M3Advice(out_dir)
    return _CACHE[out_dir].lookup(lat, lng, include_delay_scan)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="print the M3 advice for a coordinate as JSON")
    ap.add_argument("lat", type=float); ap.add_argument("lng", type=float)
    ap.add_argument("--out", default=os.environ.get("M3_OUT"), help="m3_window_forecaster.py --out folder")
    ap.add_argument("--delay-scan", action="store_true")
    a = ap.parse_args()
    print(json.dumps(m3_advice(a.lat, a.lng, a.out, a.delay_scan), indent=1))
