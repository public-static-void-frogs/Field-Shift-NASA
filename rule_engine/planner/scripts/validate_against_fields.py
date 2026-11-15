"""Check the planner against what similar real farms did and got, 2019-2023.

    python rule_engine/planner/scripts/validate_against_fields.py \
        --pool ../FieldSense/data/local/usa_sample_v3/fields.csv \
        --pool-cdl ../FieldSense/data/local/usa_sample_v3/cdl_history_all.parquet \
        --greenness data/local/planner/greenness/modis/yearly.parquet \
        --county-yields data/local/usa_sample_v2/yields/nass_yield.parquet \
        --hindcast data/local/planner/validation/hindcast.jsonl \
        --rule-engine ../FieldSense/rule_engine \
        --out data/local/planner/validation/report.json

No field has a measured yield, so a field's yield is estimated (the "proxy"): its county's NASS
yield plus b x (the field's MODIS peak NDVI minus the mean of the county's fields of that crop
that year), with b fitted per crop from county means against NASS county yields. Only corn and
soybeans have county yields here. Crops are the CDL labels: satellite estimates, not farmer
records. MODIS pixels are 250 m, so small fields mix with their neighbours (fields under
--min-acres are left out), and NDVI saturates in dense corn canopies.

1. proxy       how well county mean peak NDVI tracks NASS county yields (R^2, slope)
2. rotation    the yield after the other crop vs after the same crop, observed (proxy, within
               county and year, and within field) against the planner's rule yield factors
3. choice      how often the planner's crop for Y (hindcast_fields.py: history hidden from Y
               on) is the crop the farm grew, against simple rules
4. similar     for each hindcast field, the farms of its county that grew corn or soybeans in Y
               after the same crop: did those that grew the planner's crop earn more (proxy
               yield x the model's price of Y - the model's cost of Y - soil loss charge)? And
               does the model's expected corn - soybean cash difference (no risk penalty, no
               soil carbon) predict the realised one?
   firstYearCash  the model's own cash of Y (that year's yields, prices, costs) of the planner's
               crop against the farm's crop: what the first year of the plan gives up or gains
5. yield       the model's yield of Y for the crop grown against the proxy, beside the plain
               county yield
"""

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_tables  # noqa: E402,F401  (imports rule_engine from --rule-engine)

from rule_engine import build_advisor  # noqa: E402

YEARS = range(2019, 2024)  # CDL (2018 on) and MODIS (to 2023) overlap, with a previous crop
NASS = {"CORN": "corn", "SOYBEANS": "soybeans"}
PAIR = ("corn", "soybeans")
MIN_FIELDS = 5  # per county, crop and year for a county mean
TRIM = (0.4, 1.6)  # proxy / county yield outside this: a CDL label or pixel mix-up, left out


def field_years(pool: Path, cdl: Path, min_acres: float) -> pd.DataFrame:
    """One row per field and year: county, acres, CDL crop of the year and of the two before."""
    catalog = build_advisor().catalog
    fields = pd.read_csv(pool, dtype={"CSBID": str, "STATEFIPS": str, "CNTYFIPS": str})
    fields = fields[fields["CSBACRES"] >= min_acres]
    fields["county"] = fields["STATEFIPS"].str.zfill(2) + fields["CNTYFIPS"].str.zfill(3)
    columns = ["CSBID", *(f"CDL{y}" for y in range(min(YEARS) - 2, max(YEARS) + 1) if y >= 2018)]
    history = pd.read_parquet(
        cdl, columns=columns, filters=[("CSBID", "in", list(fields["CSBID"]))]
    )
    codes = pd.unique(history[columns[1:]].to_numpy().ravel())
    names = {}
    for code in codes:
        crop = catalog.by_cdl(int(code)) if pd.notna(code) else None
        names[code] = crop.id if crop else None
    wide = fields[["CSBID", "county", "CSBACRES"]].merge(history, on="CSBID")
    rows = []
    for y in YEARS:
        part = wide[["CSBID", "county", "CSBACRES"]].copy()
        part["year"] = y
        for name, offset in (("crop", 0), ("prev", 1), ("prev2", 2)):
            column = f"CDL{y - offset}"
            part[name] = wide[column].map(names) if column in wide else None
        rows.append(part)
    frame = pd.concat(rows, ignore_index=True)
    return frame.rename(columns={"CSBID": "field_id", "CSBACRES": "acres"})


def fit_proxy(frame: pd.DataFrame, county_yields: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Adds `proxy` (estimated field yield) to the corn and soybean rows."""
    report, parts = {}, []
    for crop in PAIR:
        part = frame[(frame["crop"] == crop) & frame["ndvi_peak"].notna()].copy()
        group = part.groupby(["county", "year"])["ndvi_peak"]
        part["county_ndvi"] = group.transform("mean")
        part["county_n"] = group.transform("size")
        part = part[part["county_n"] >= MIN_FIELDS]
        means = part.groupby(["county", "year"]).agg(ndvi=("ndvi_peak", "mean")).reset_index()
        means = means.merge(county_yields[county_yields["crop"] == crop], on=["county", "year"])
        x, y = means["ndvi"].to_numpy(), means["yield"].to_numpy()
        slope, intercept = np.polyfit(x, y, 1)
        r2 = float(np.corrcoef(x, y)[0, 1] ** 2)
        # within county over the years: does the greener year yield more?
        dx = x - means.groupby("county")["ndvi"].transform("mean").to_numpy()
        dy = y - means.groupby("county")["yield"].transform("mean").to_numpy()
        within = float(np.corrcoef(dx, dy)[0, 1]) if len(dx) > 2 else None
        report[crop] = {
            "countyYears": len(means),
            "slopeYieldPerNdvi": round(float(slope), 1),
            "r2AcrossCounties": round(r2, 3),
            "correlationWithinCounty": None if within is None else round(within, 3),
        }
        part = part.merge(
            county_yields[county_yields["crop"] == crop], on=["county", "year", "crop"]
        )
        part["proxy"] = part["yield"] + slope * (part["ndvi_peak"] - part["county_ndvi"])
        part["relative"] = part["proxy"] / part["yield"]
        keep = part["relative"].between(*TRIM)
        report[crop]["fieldYears"] = int(keep.sum())
        report[crop]["trimmedOutside"] = [*TRIM, int((~keep).sum())]
        parts.append(part[keep])
    return pd.concat(parts), report


def rotation(proxied: pd.DataFrame, hindcast: list[dict]) -> dict:
    out = {}
    for crop, other in (("corn", "soybeans"), ("soybeans", "corn")):
        part = proxied[(proxied["crop"] == crop) & proxied["prev"].isin([crop, other])].copy()
        # within county and year: mean relative yield after the other crop / after the same
        cells = part.groupby(["county", "year", "prev"])["relative"].agg(["mean", "size"])
        cells = cells.unstack("prev").dropna()
        cells = cells[(cells[("size", crop)] >= 3) & (cells[("size", other)] >= 3)]
        weight = np.minimum(cells[("size", crop)], cells[("size", other)])
        ratio = cells[("mean", other)] / cells[("mean", crop)]
        boot = np.random.default_rng(0)
        draws = [
            float(np.average(ratio.iloc[i], weights=weight.iloc[i]))
            for i in (boot.integers(0, len(ratio), len(ratio)) for _ in range(500))
        ]
        # within field: the field's own years after each crop, less its county-year mean
        part["residual"] = part["relative"] - part.groupby(["county", "year"])[
            "relative"
        ].transform("mean")
        per_field = part.groupby(["field_id", "prev"])["residual"].mean().unstack("prev").dropna()
        rules = [
            r["hindcast"][crop]["ruleYieldFactor"]
            for r in hindcast
            if r.get("status") == "ok" and crop in r["hindcast"] and r["history"]
            and r["history"][-1] == crop
        ]  # fmt: skip
        out[f"{crop}_after_{other}_vs_after_{crop}"] = {
            "countyYears": len(ratio),
            "observedRatio": round(float(np.average(ratio, weights=weight)), 4),
            "observedRatio90": [round(float(np.quantile(draws, q)), 4) for q in (0.05, 0.95)],
            "fieldsWithBoth": len(per_field),
            "withinFieldDifference": round(float((per_field[other] - per_field[crop]).mean()), 4),
            "plannerRatio": round(1 / float(np.mean(rules)), 4) if rules else None,
            "plannerRuleFactorAfterSame": round(float(np.mean(rules)), 4) if rules else None,
        }
    return out


def after_each_crop(proxied: pd.DataFrame, hindcast: list[dict]) -> dict:
    """Yield after each previous crop / yield after the usual one (corn after soybeans,
    soybeans after corn), observed within county and year, beside the planner's rule factors."""
    out = {}
    for crop, usual in (("corn", "soybeans"), ("soybeans", "corn")):
        part = proxied[(proxied["crop"] == crop) & proxied["prev"].notna()]
        cells = part.groupby(["county", "year", "prev"])["relative"].agg(["mean", "size"])
        base = cells.xs(usual, level="prev")
        factors: dict[str, list[float]] = defaultdict(list)
        for r in hindcast:
            if r.get("status") == "ok" and crop in r["hindcast"] and r["history"]:
                factors[r["history"][-1]].append(r["hindcast"][crop]["ruleYieldFactor"])
        planner_base = np.mean(factors[usual]) if factors[usual] else None
        rows = {}
        for prev in part["prev"].value_counts().index[:10]:
            if prev == usual:
                continue
            mine = cells.xs(prev, level="prev")
            both = mine.join(base, lsuffix="_prev", rsuffix="_usual", how="inner")
            both = both[(both["size_prev"] >= 3) & (both["size_usual"] >= 3)]
            if len(both) < 10:
                continue
            weight = np.minimum(both["size_prev"], both["size_usual"])
            ratio = both["mean_prev"] / both["mean_usual"]
            rows[prev] = {
                "countyYears": len(both),
                "observedRatio": round(float(np.average(ratio, weights=weight)), 4),
                "plannerRatio": round(float(np.mean(factors[prev]) / planner_base), 4)
                if factors.get(prev) and planner_base
                else None,
                "plannerRows": len(factors.get(prev, [])),
            }
        out[f"{crop}_vs_after_{usual}"] = rows
    return out


def first_year_cash(hindcast: list[dict]) -> dict:
    """The model's cash of year Y (that year's yields where observed, prices and costs) of the
    planner's crop against the crop the farm grew, where the planner could have grown it."""
    rows = []
    for r in hindcast:
        if r.get("status") != "ok" or r["farmerCrop"] not in r["hindcast"]:
            continue
        h = r["hindcast"]

        def cash(c, h=h):
            return h[c]["yield"] * h[c]["price"] - h[c]["cost"] - h[c]["erosion"]

        rows.append(
            {
                "region": r["region"],
                "same": r["plannerCrop"] == r["farmerCrop"],
                "planner": cash(r["plannerCrop"]) - cash(r["farmerCrop"]),
                "myopic": cash(r["myopicCrop"]) - cash(r["farmerCrop"]),
                "expected": r["expectedCash"][r["plannerCrop"]]
                - r["expectedCash"][r["farmerCrop"]],
            }
        )
    frame = pd.DataFrame(rows)
    differ = frame[~frame["same"]]
    return {
        "fieldYears": len(frame),
        "plannerDiffers": len(differ),
        "plannerMinusFarmerUsdPerAcre": {
            "mean": round(float(differ["planner"].mean()), 1),
            "median": round(float(differ["planner"].median()), 1),
            "plannerAhead": round(float((differ["planner"] > 0).mean()), 3),
            "expectedMean": round(float(differ["expected"].mean()), 1),
        },
        "myopicMinusFarmerUsdPerAcre": {
            "mean": round(float(frame["myopic"].mean()), 1),
            "median": round(float(frame["myopic"].median()), 1),
            "myopicAhead": round(float((frame["myopic"] > 0).mean()), 3),
        },
        "byRegion": {
            k: {
                "n": len(g),
                "plannerMinusFarmerMean": round(float(g["planner"].mean()), 1),
                "plannerAhead": round(float((g["planner"] > 0).mean()), 3),
            }
            for k, g in differ.groupby("region")
            if len(g) >= 25
        },
    }


def choice(hindcast: list[dict], frame: pd.DataFrame) -> dict:
    ok = [r for r in hindcast if r.get("status") == "ok" and r["farmerCrop"] and r["history"]]
    # the crop most grown in the county after the same previous crop (all sampled fields)
    usual = (
        frame.dropna(subset=["crop", "prev"])
        .groupby(["county", "year", "prev"])["crop"]
        .agg(lambda s: s.value_counts().index[0])
        .to_dict()
    )
    rotate = {"corn": "soybeans", "soybeans": "corn"}
    hits = Counter()
    by_region: dict[str, Counter] = defaultdict(Counter)
    confusion = Counter()
    for r in ok:
        farmer, last = r["farmerCrop"], r["history"][-1]
        guesses = {
            "planner": r["plannerCrop"],
            "plannerMyopic": r["myopicCrop"],
            "repeatLastCrop": last,
            "cornSoyRotation": rotate.get(last, last),
            "countyMajorityAfterSameCrop": usual.get((r["countyFips"], r["year"], last)),
        }
        for name, guess in guesses.items():
            hits[name] += guess == farmer
        by_region[r["region"]]["n"] += 1
        by_region[r["region"]]["planner"] += r["plannerCrop"] == farmer
        confusion[(r["plannerCrop"], farmer)] += 1
    n = len(ok)
    return {
        "fieldYears": n,
        "farmerCropInPlannerSet": round(sum(r["farmerCrop"] in r["crops"] for r in ok) / n, 3),
        "agreement": {k: round(v / n, 3) for k, v in hits.items()},
        "plannerAgreementByRegion": {
            k: {"n": c["n"], "agreement": round(c["planner"] / c["n"], 3)}
            for k, c in sorted(by_region.items(), key=lambda kv: -kv[1]["n"])
            if c["n"] >= 20
        },
        "plannerPicks": Counter(r["plannerCrop"] for r in ok).most_common(),
        "farmerCrops": Counter(r["farmerCrop"] for r in ok).most_common(12),
        "topConfusions": [
            {"planner": p, "farmer": f, "n": c} for (p, f), c in confusion.most_common(10)
        ],
    }


def similar(hindcast: list[dict], proxied: pd.DataFrame) -> dict:
    pool = proxied.set_index(["county", "year", "prev"]).sort_index()
    rows = []
    for r in hindcast:
        if r.get("status") != "ok" or not r["history"] or not set(PAIR) <= set(r["hindcast"]):
            continue
        key = (r["countyFips"], r["year"], r["history"][-1])
        if key not in pool.index:
            continue
        farms = pool.loc[[key]]
        farms = farms[farms["field_id"] != r["fieldId"]]
        cash = {}
        for crop in PAIR:
            h = r["hindcast"][crop]
            grew = farms[farms["crop"] == crop]
            if len(grew) >= 3:
                cash[crop] = (grew["proxy"] * h["price"] - h["cost"] - h["erosion"]).to_numpy()
        if len(cash) < 2:
            continue
        realised = float(cash["corn"].mean() - cash["soybeans"].mean())
        own = r.get("expectedCash") or r["expected"]
        expected = own["corn"] - own["soybeans"]
        rows.append(
            {
                "planner": r["plannerCrop"],
                "farmer": r["farmerCrop"],
                "prev": r["history"][-1],
                "year": r["year"],
                "region": r["region"],
                "expected": expected,
                "realised": realised,
                "farms": int(sum(len(v) for v in cash.values())),
                "cornShare": len(cash["corn"]) / sum(len(v) for v in cash.values()),
            }
        )
    frame = pd.DataFrame(rows)
    if frame.empty:
        return {"fieldYears": 0}
    pick = frame[frame["planner"].isin(PAIR)].copy()
    sign = np.where(pick["planner"] == "corn", 1, -1)
    pick["gain"] = sign * pick["realised"]  # planner's crop minus the other, USD/acre
    # the majority of the similar farms, as a rule to beat
    majority = np.where(frame["cornShare"] >= 0.5, 1, -1)
    return {
        "fieldYears": len(frame),
        "similarFarmsPerFieldYear": float(frame["farms"].median()),
        "plannerPickedCornOrSoy": len(pick),
        "plannerCropEarnedMore": round(float((pick["gain"] > 0).mean()), 3),
        "meanGainUsdPerAcre": round(float(pick["gain"].mean()), 1),
        "medianGainUsdPerAcre": round(float(pick["gain"].median()), 1),
        "majorityOfFarmsCropEarnedMore": round(float((majority * frame["realised"] > 0).mean()), 3),
        "signAccuracyOfExpectedDifference": round(
            float((np.sign(frame["expected"]) == np.sign(frame["realised"])).mean()), 3
        ),
        "correlationExpectedRealised": round(
            float(np.corrcoef(frame["expected"], frame["realised"])[0, 1]), 3
        ),
        "maeExpectedVsRealisedUsdPerAcre": round(
            float((frame["expected"] - frame["realised"]).abs().mean()), 1
        ),
        "meanExpectedUsdPerAcre": round(float(frame["expected"].mean()), 1),
        "meanRealisedUsdPerAcre": round(float(frame["realised"].mean()), 1),
        "byYear": {
            int(y): {
                "n": len(g),
                "meanExpected": round(float(g["expected"].mean()), 1),
                "meanRealised": round(float(g["realised"].mean()), 1),
                "plannerCropEarnedMore": round(
                    float((pick.loc[pick["year"] == y, "gain"] > 0).mean()), 3
                )
                if (pick["year"] == y).any()
                else None,
            }
            for y, g in frame.groupby("year")
        },
        "byPreviousCrop": {
            p: {
                "n": len(g),
                "plannerCropEarnedMore": round(float((g["gain"] > 0).mean()), 3),
                "meanGain": round(float(g["gain"].mean()), 1),
            }
            for p, g in pick.groupby("prev")
            if len(g) >= 10
        },
    }


def yields(hindcast: list[dict], proxied: pd.DataFrame) -> dict:
    own = proxied.set_index(["field_id", "year"])
    out = {}
    for crop in PAIR:
        model, county, proxy = [], [], []
        for r in hindcast:
            if r.get("status") != "ok" or r["farmerCrop"] != crop or crop not in r["hindcast"]:
                continue
            key = (r["fieldId"], r["year"])
            if key not in own.index:
                continue
            row = own.loc[key]
            model.append(r["hindcast"][crop]["yield"])
            county.append(float(row["yield"]))
            proxy.append(float(row["proxy"]))
        if not model:
            continue
        model, county, proxy = map(np.array, (model, county, proxy))
        out[crop] = {
            "fieldYears": len(model),
            "modelMaePct": round(float(np.abs(model - proxy).mean() / proxy.mean()) * 100, 1),
            "countyYieldMaePct": round(
                float(np.abs(county - proxy).mean() / proxy.mean()) * 100, 1
            ),
            "modelBiasPct": round(float((model - proxy).mean() / proxy.mean()) * 100, 1),
            "countyYieldBiasPct": round(float((county - proxy).mean() / proxy.mean()) * 100, 1),
            "modelOverCountyYield": round(float(np.mean(model / county)), 3),
            # the proxy is the county yield plus the field's greenness, so the county yield is
            # its centre: the test of the model's own field adjustment (rules, irrigation,
            # water) is whether it moves the same way as the field's greenness
            "adjustmentCorrelation": round(
                float(np.corrcoef(model / county - 1, proxy / county - 1)[0, 1]), 3
            )
            if np.std(model / county) > 0
            else None,
            "modelCorrelation": round(float(np.corrcoef(model, proxy)[0, 1]), 3),
            "countyCorrelation": round(float(np.corrcoef(county, proxy)[0, 1]), 3),
        }
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--pool", required=True, type=Path, help="fields.csv of the similar farms")
    parser.add_argument("--pool-cdl", required=True, type=Path, help="CDL history parquet (CSBID)")
    parser.add_argument("--greenness", required=True, type=Path)
    parser.add_argument("--county-yields", required=True, type=Path)
    parser.add_argument("--hindcast", required=True, type=Path)
    parser.add_argument("--rule-engine", type=Path)
    parser.add_argument("--min-acres", type=float, default=25.0)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    frame = field_years(args.pool, args.pool_cdl, args.min_acres)
    green = pd.read_parquet(
        args.greenness,
        columns=["field_id", "year", "ndvi_peak", "composites"],
        filters=[("year", ">=", min(YEARS)), ("year", "<=", max(YEARS))],
    )
    green = green[green["field_id"].isin(set(frame["field_id"])) & (green["composites"] >= 10)]
    frame = frame.merge(
        green[["field_id", "year", "ndvi_peak"]], on=["field_id", "year"], how="left"
    )
    county_yields = pd.read_parquet(
        args.county_yields, columns=["county_fips", "crop", "year", "yield_bu_acre"]
    )
    county_yields = county_yields.rename(
        columns={"county_fips": "county", "yield_bu_acre": "yield"}
    )
    county_yields["crop"] = county_yields["crop"].map(NASS)
    county_yields["county"] = county_yields["county"].astype(str).str.zfill(5)
    proxied, proxy_report = fit_proxy(frame, county_yields)
    with args.hindcast.open() as handle:
        hindcast = [json.loads(line) for line in handle]
    status = Counter(r.get("status") for r in hindcast)
    report = {
        "fields": int(frame["field_id"].nunique()),
        "hindcastRows": dict(status),
        "proxy": proxy_report,
        "proxiedFieldYears": len(proxied),
        "rotation": rotation(proxied, hindcast),
        "afterEachCrop": after_each_crop(proxied, hindcast),
        "firstYearCash": first_year_cash(hindcast),
        "choice": choice(hindcast, frame),
        "similarFarms": similar(hindcast, proxied),
        "yield": yields(hindcast, proxied),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
