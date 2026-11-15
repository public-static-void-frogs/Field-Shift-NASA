"""Soil lost to rain (USLE), shared by the yearly model and the weekly planner.

    A (t/ha/yr) = 2.24 x R x K x LS x C x P

R comes from the field's rain, K is the soil's erodibility (SSURGO kw), LS from its slope and
slope length (SSURGO slopelenusle_r where fetched, else data/weekly_parameters.csv
slope_length_m), C from the crop (data/weekly_crops.csv) and its tillage, and P (support practice)
is 1: terraces and contouring are not known. The result is an estimate of sheet and rill erosion,
not a measurement, and it is not calibrated for any field.
"""

import csv
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).parent / "data"
SI_TO_US_EROSIVITY = 17.02  # MJ mm/(ha h yr) per hundreds of ft tonf in/(acre h yr)
# 1000 ft: USLE slope lengths beyond it are rare and the LS equation was not fitted there
# (Wischmeier and Smith 1978, recalled); a few SSURGO map units list 400-1000 m
MAX_SLOPE_LENGTH_M = 305.0


@lru_cache(maxsize=1)
def load_parameters() -> dict[str, str]:
    with (DATA / "weekly_parameters.csv").open() as handle:
        return {row["name"]: row["value"] for row in csv.DictReader(handle)}


def number(name: str) -> float:
    return float(load_parameters()[name])


@lru_cache(maxsize=1)
def load_crop_factors() -> dict[str, dict]:
    with (DATA / "weekly_crops.csv").open() as handle:
        return {
            row["crop"]: {
                "kc": (float(row["kc_ini"]), float(row["kc_mid"]), float(row["kc_end"])),
                "usle": float(row["usle_crop_factor"]),
                "nitrogen": float(row["n_credit_kg_ha"]),
            }
            for row in csv.DictReader(handle)
        }


def slope_factor(slope_pct: float, length_m: float) -> float:
    """USLE LS factor (OMAFRA factsheet 23-005; reproduces its Table 3)."""
    exponent = 0.2 if slope_pct < 1 else 0.3 if slope_pct < 3 else 0.4 if slope_pct < 5 else 0.5
    return (0.065 + 0.0456 * slope_pct + 0.006541 * slope_pct**2) * (length_m / 22.1) ** exponent


def annual_erosivity(rain_mm: float) -> float:
    """USLE R factor in US units from the mean annual rain.

    Renard and Freimund (1994, J. Hydrol. 157:287-306), recalled and not re-read: it gives about
    165 for 900 mm, which is central Iowa's mapped value, and is too high where much of the
    precipitation is snow.
    """
    if rain_mm < 850:
        metric = 0.0483 * rain_mm**1.61
    else:
        metric = 587.8 - 1.219 * rain_mm + 0.004105 * rain_mm**2
    return metric / SI_TO_US_EROSIVITY


def tillage_factor(tillage: str, drilled: bool) -> float:
    if tillage == "strip_till":
        return number(f"usle_tillage_strip_till_{'drilled' if drilled else 'row'}")
    return number(f"usle_tillage_{tillage}")


class YearlySoilLoss:
    """Soil loss of one season for the yearly model, in t/ha.

    The season's ground cover is the crop's C factor x its tillage factor. A cover crop protects
    the ground in the months before the crop is planted: that share of the year's erosive rain
    (`erosive_share_before_planting`) meets the cover crop's factor instead.

    `rain_mm` is the field's mean annual rain. The season summaries hold April-October only, so
    the caller divides their sum by `season_share_of_annual_rain` (an assumption, not a value
    read for the field).
    """

    def __init__(self, soil: dict, rain_mm: float | None):
        self.gaps: list[dict] = []
        self.unit: float | None = None  # t/ha per unit of C x P
        kw, slope = soil.get("kw"), soil.get("slope_pct")
        length = soil.get("slope_length_m")
        if kw is None or slope is None or not rain_mm:
            self.gaps.append({"code": "soil_loss_unknown", "affects": ["erosion"]})
            return
        if not length:
            length = number("slope_length_m")
            self.gaps.append({"code": "slope_length_assumed", "slopeLengthM": length})
        elif float(length) > MAX_SLOPE_LENGTH_M:
            self.gaps.append({"code": "slope_length_capped", "slopeLengthM": float(length)})
            length = MAX_SLOPE_LENGTH_M
        self.erosivity = annual_erosivity(rain_mm)
        self.unit = (
            number("usle_metric")
            * self.erosivity
            * float(kw)
            * slope_factor(float(slope), float(length))
        )
        self.gaps.append({"code": "soil_loss_uncalibrated"})

    def t_per_ha(self, crop: str, tillage: str, cover: str, drilled: bool) -> float:
        if self.unit is None:
            return 0.0
        factors = load_crop_factors()
        row = factors.get(crop)
        c = row["usle"] if row else number("usle_crop_factor_unlisted")
        ground = c * tillage_factor(tillage, drilled)
        if cover != "none":
            early = number("erosive_share_before_planting")
            ground = ground * (1.0 - early) + number("usle_cover_crop_factor") * early
        return self.unit * ground
