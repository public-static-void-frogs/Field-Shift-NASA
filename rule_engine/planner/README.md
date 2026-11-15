# Rotation planner

A multi-year planning layer on top of the rule engine. The rule engine scores one crop for one
coming year; the planner chooses a sequence of crops, tillage systems and cover crops over several
years, because each choice changes what the rules say about the next one.

```sh
python -m rule_engine.planner --field 191825000034355 \
    --fields data/local/usa_sample/fields.jsonl \
    --summaries data/local/usa_sample/season_summary data/local/planner/season_summary \
    --horizon 5 --q-learning 20000
```

## The decision problem

| Part     | Definition                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| State    | Plan year, the last five crops, two soil carbon pools, and the year just experienced.                                                                                                                                    |
| Action   | Crop × tillage (`conventional`, `strip_till`, `no_till`) × cover crop before it (`none`, `rye`). Invalid combinations are masked: a standing perennial is not tilled, and rye goes only before warm-season annual crops. |
| Chance   | One whole historical year is drawn each step: its weather, yields and prices together, so their real correlation is kept. The odds of each year depend on the year just experienced (see below).                         |
| Reward   | USD per acre per year: revenue − production cost (that year's cost level, moved to the field's irrigation status) − risk penalty + soil carbon value − soil loss charge. Land cost is excluded.                          |
| Dynamics | The crop history shifts by one and the soil carbon pools take one yearly step; the year just experienced is the drawn year.                                                                                              |

`exact_plan` solves the problem by dynamic programming and is the reference. `RotationEnv` exposes
the same model with Gymnasium-style `reset` and `step` for learning agents; `q_learning` is the
reference learner. Every plan is scored by `evaluate`, the exact expected value of a policy.

## Carry-over between years

Two conditions are known before planting and shift the odds of the coming year (`chance.py`):

- **Drought.** The Drought Monitor class at the end of one season against the class at the start
  of the next. Across the national sample (102,570 field-year pairs, 2015–2025) they correlate at
  0.45. Counties that started the season in D1 or worse had corn yields 4–6 % below their mean.
- **Price.** The harvest (September) price level of the year just finished against the level
  preceding each candidate year, in constant dollars around the trend. The marketing-year price
  is not used for this: it is final only after the next crop is planned.

The next year is drawn from the historical years, weighted by how closely each year's starting
conditions match the conditions just reached. `Persistence(strength, bandwidth)` sets how strongly:
strength 0 gives independent years.

With carry-over the best plan is a policy that reacts to the year just experienced, not a fixed
sequence. `open_loop_plan` gives the best fixed sequence, so the difference between the two is the
value of adapting. On 12 Iowa sample fields over four years it was 0–16 USD per acre in total,
at most about 2 % of the plan value: prices of the main crops move together, so the year
just experienced rarely changes which crop is best. The plan's first year shifts more than that,
because its odds are conditioned on the latest real year instead of an average year.

## The planning year and the price outlook

A plan is made in the autumn before its first planted year, `--plan-year` (default 2027:
planned after the 2026 harvest). Only what was published by then is used (`context.py`,
`prices.py`):

| Input                    | Used up to                    | Source                                               |
| ------------------------ | ----------------------------- | ---------------------------------------------------- |
| Seasons (weather, yield) | plan year − 1                 | season summaries, NASS county and state yields       |
| Marketing-year prices    | plan year − 2                 | NASS Quick Stats (`data/nass_long_history.csv`)      |
| September price received | plan year − 1                 | NASS Agricultural Prices (`data/harvest_prices.csv`) |
| Price outlook            | November WASDE, USDA baseline | `data/price_outlook.csv`                             |

The expected price of a crop for the plan year:

- **Corn, soybeans, wheat, sorghum, barley, oats, cotton, rice:** the USDA baseline for the
  plan year × (November WASDE / baseline for the current year)^ρ. ρ = 0.68 (0.677) is the measured
  year-to-year persistence of the detrended real price, so a high WASDE year carries partly
  into the next. Wheat classes are moved by their own September price against all wheat, and
  every crop by its state's price against the US over the last five known years.
  - A plan for P uses only the outlooks published by 30 November of P − 1 (the `published`
    column), so a 2021 plan sees the February 2020 baseline (OCE-2020-1) and the November 2020
    WASDE.
  - The file also holds the baselines of February 2020–2022 and the November WASDE of 2020–2022
    for the hindcast.
  - The nominal outlook is moved into constant dollars of the latest CPI year, as the other
    prices are. The factor is 1.0 for 2027, a year past the CPI table.
- **Other crops (peanuts, alfalfa, pulses, flax...):** the September price of the current year,
  corrected by its usual gap to the marketing-year mean, carried forward with the same
  persistence along the real-price trend.
- **No usable series:** the rule engine's planning price.

For the 2027 plan (USDA WASDE-677 of 10 November 2026; USDA Agricultural Projections to 2035,
OCE-2026-1, Feb 2026), US prices:

| Crop     | WASDE 2026/27 | Baseline 2027/28 | Expected 2027/28 |
| -------- | ------------- | ---------------- | ---------------- |
| Corn     | 4.60 USD/bu   | 4.20             | 4.54             |
| Soybeans | 12.10 USD/bu  | 10.40            | 11.60            |
| Wheat    | 6.20 USD/bu   | 5.60             | 6.15             |
| Sorghum  | 4.45 USD/bu   | 4.05             | 4.35             |
| Cotton   | 0.760 USD/lb  | 0.660            | 0.73             |

Each drawn year's price is the expected price × that year's deviation from the trend of the
real price, so a 1980s year is no longer drawn as a high-price year for being early. The plan
starts after the current year (2026) as its own row of the year odds: its September price is
known, its season is not yet in the data, so it has no drought signal. A plan for later years
(after 2027) is still the closed-loop policy of the yearly model, with the same expected
prices: the baseline years after the plan year are not used yet.

## One learned policy for all fields

`exact_plan` needs the full model of one field and several seconds. `ppo.py` trains a single
network that plans for any field from its soil, position, crop history and the rule engine's
one-year scores, in milliseconds.

```sh
python rule_engine/planner/scripts/build_tables.py \
    --fields data/local/usa_sample_v2/fields.jsonl \
    --summaries data/local/usa_sample_v2/work/season_summary \
    --out data/local/planner/tables_usa --workers 14 \
    --irrigation data/local/planner/irrigation/irrigation_v3.parquet \
    --greenness data/local/planner/greenness/modis/yearly.parquet \
    --soil-extra <soil_extra.csv> data/local/planner/soil/mukey_profile.csv \
    [--rule-engine <other checkout>/rule_engine]
python rule_engine/planner/scripts/train_policy.py \
    --tables data/local/planner/tables_usa --out data/local/planner/policy_usa \
    --iterations 2500 --hidden 512 --entropy 0.01
python -m rule_engine.planner --field <id> ... --policy data/local/planner/policy_usa/policy.pt
```

- The optional inputs are joined onto each field record before its table is built:
  `--irrigation` (the `scripts/fetch_irrigation.py` table, reduced per field by
  `irrigation.field_status`), `--greenness` (MODIS yearly peak NDVI, kept for fields with at
  least five years) and `--soil-extra` (CSV files keyed by `mukey`, merged into the field's soil:
  NCCPI, slope length, bulk density, available water). `--rule-engine` builds with another
  checkout's rule engine (catalog, rules, reference prices and yields) and this planner.
- `tabular.py` turns each field's problem into arrays. The reward is stored in factored form,
  `scale[node, action] × gain[crop, year] + fixed[node, action] + weather[crop, year]`, which is
  exact and about 25 times smaller than one value per node, action and year. Exact solving and
  scoring a policy then take milliseconds per field.
- `ppo.py` is PPO with action masking, written directly in PyTorch. Whole counties are held out
  (`is_test_county`), so the test fields are in places the policy never saw.
- Every score is the exact expected plan value of the policy, not a sampled return.
- The trainer keeps the large arrays in memory-mapped files under `<out>/arrays` (4.6 GB for the
  national sample, safe to delete afterwards) and needs about 3.5 GB of process memory.

### Crops

The vocabulary is corn, soybeans, sorghum, oats, winter wheat, spring wheat, durum wheat, barley,
alfalfa, cotton, rice, peanuts, sugarbeets, potatoes, dry peas, lentils, chickpeas, flax and
proso millet (`tables.CROPS`): the crops with a cost
budget, a price and a yield. Yields and prices are kept in the rule engine catalog's units
(bushels, lb, cwt or tons; `tables.unit_kind`, `tables.t_ha_per`). Cotton is priced by its lint
with the cottonseed added (see Price below). Rice is offered only on fields the irrigation map
marks as irrigated, and only in the 119 counties where CDL shows rice on at least 0.5 % of the
sampled acres or where the field grew it (`data/rice_counties.csv`, `not_a_rice_county`): the
Sacramento Valley in California, the Mississippi Delta, the Gulf Coast of Louisiana and Texas.
Potatoes need an irrigated field too (`tables.needs_irrigation`, `potatoes_needs_irrigation`),
except in Maine, Minnesota, North Dakota, New York and Pennsylvania, which grow them dryland;
in the West, Wisconsin and Michigan their yields and budgets are irrigated ones. Sugarbeets and
potatoes are sold under contract to a nearby factory, so they are offered only in counties where
CDL shows them on at least 0.5 % of the sampled acres (`data/processor_counties.csv`, copied from
the FieldSense planner) or where the field itself grew them (`no_processor_nearby`). Alfalfa is
sold as hay within trucking distance and needs haying equipment, so it is offered only in
counties where CDL shows alfalfa and other hay on at least 1 % of the sampled acres, 2,499 of
3,087 (`data/hay_counties.csv`, `scripts/build_hay_counties.py`), or where the field grew it
(`no_hay_market_nearby`). That takes alfalfa off about 6,300 of the 30,000 sampled fields, most
of them in Illinois, Texas, Iowa, North Dakota and Indiana. Each field plans with at
most five of them (`model.MAX_CROPS`), the ones most grown in its state by CDL acreage
(`rule_engine/data/state_crops.csv`). A crop left out is reported under `dataGaps`. Adding a
crop to the vocabulary means retraining.

### National sample

`scripts/sample_fields.py` draws the fields and `scripts/build_sample.py` writes their records.
The sample is spread over 1-degree cells × dominant crop group × rotation diversity, then
thinned so common soils (texture, drainage, organic matter) do not crowd out rare ones. A
stratum of N fields gets about √N fields, so rare places, crop mixes and soils are
over-represented: the sample describes the range of US fields, not the average field.

|                     |                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fields              | 30,000 in 48 states, 2,682 counties, 870 one-degree cells (25.5–49.4° N)                                    |
| Dominant crop group | corn 20 %, soybeans 18 %, hay 10 %, alfalfa 10 %, wheat 10 %, pasture 8 %, cotton 4 %, 10 other groups 20 % |
| Soil texture        | loamy 42 %, sandy 24 %, silty loam 20 %, clayey 12 %                                                        |
| Drainage            | well 63 %, poor 31 %, excessive 6 %                                                                         |
| Organic matter      | under 1 %: 15 %, 1–2 %: 35 %, 2–4 %: 34 %, over 4 %: 16 %                                                   |

Of the 30,000 fields, 29,557 can be planned. 354 have fewer than two plannable crops and 89
have none; these are mostly hay, pasture and vegetable fields.

### Result

`policy_usa_v6`: planned for 2027 (the price outlook and timing rule), with irrigation,
year-specific costs, the soil loss charge, the extra soil inputs, the 19 crops, the potato and
rice gates and the changes listed under Next changes. 26,387 training fields and 3,170 fields
in held-out counties, 20 minutes on one GPU. USD per acre over five years:

| Held-out fields | Exact optimum | Learned policy | Year-by-year rule | Gap closed |
| --------------- | ------------- | -------------- | ----------------- | ---------- |
| All 3,170       | 789.8         | 774.4          | 723.7             | 77 %       |
| 2 crops (24)    | 444.4         | 430.7          | 436.0             | −64 %      |
| 3 crops (278)   | 902.3         | 884.0          | 823.1             | 77 %       |
| 4 crops (662)   | 705.9         | 690.8          | 625.9             | 81 %       |
| 5 crops (2,206) | 804.6         | 789.4          | 743.6             | 75 %       |

The learned policy is within 1 % of the optimum on 51 % of held-out fields and trails the
year-by-year rule on 41 %; its mean shortfall from the optimum is 15.5 USD per acre (on 2,000
training fields: 81 % of the gap closed, 12.9 USD). It is an approximation: where the exact plan
is affordable, use it. By state (at least 50 held-out fields) the gap closed is 95 % in Kansas
and Pennsylvania, 94 % in Illinois, 93 % in Missouri, 89 % in Iowa and 74 % in Texas, but 19 % in
North Dakota, 34 % in New Mexico, 57 % in Minnesota and 69 % in Ohio (`policy_usa_v6/report.json`,
`heldOut.byRegion`). In Arizona the optimum is the year-by-year rule (alfalfa every year), so
there is no gap to close, and in New Mexico and Washington the gap is under 8 USD/acre. North
Dakota's figure reflects how little rotation is worth there, not a larger shortfall (see Next
changes).

`policy_usa_v5`, the same run without the gates, closed 79 % (optimum 1,055.9, learned 1,041.9,
year-by-year rule 989.8). The gates take 266 USD/acre off the held-out optimum, mostly in
Wisconsin (5,581 to 982 on the training fields) and Michigan (2,866 to 716), where v5 planned
potatoes on fields the irrigation map shows as dryland, and in California (3,870 to 3,074),
where it planned rice outside the Sacramento Valley.

The values are about five times those of `policy_usa_v3` (optimum 161.6, learned 149.1,
year-by-year rule 59.2, 88 % closed), and are not comparable. Before the gates, two crops
carried most of the rise:

- **Potatoes** added 355 of v5's 1,056 USD: without them the held-out optimum was 701. In
  Wisconsin they lifted the optimum from 666 to 6,060 and in Michigan from 690 to 3,486, mostly
  on dryland fields at irrigated yields. The gates remove most of this.
- **Alfalfa** adds 257: without it the optimum was 799. Most of that is in the West, now that its
  seeding year is charged once (Washington 602 to 3,387, New Mexico −563 to 2,620, Arizona 1,700
  to 3,167, Kansas −48 to 681). The gates leave it, and it is now the largest unverified term
  (see the strategy check under Checked against real fields).

The rest comes from planning one year, 2027, at its trend yields and USDA outlook prices,
instead of drawing among 1981–2025 at each year's own yields.

The earlier `policy_usa` (before irrigation, year-specific costs, the soil loss charge and the
new crops) closed 89 % (optimum 309.0, learned 303.3, year-by-year rule 258.8; within 1 % on 68 %). The
values are not comparable. Most of the fall is alfalfa in the irrigated West: the earlier tables
paid for it with an Iowa budget against California's 7-ton yields (about +730 USD per acre in
its first year), while the desert budgets now in `data/costs_alfalfa.csv` cost 1,590 USD per
acre in the seeding year and break even once the stand is established. The year-by-year rule
lost the most because it never pays for a seeding year.

On 45 % of `policy_usa`'s held-out fields even the best plan had a negative value. The USDA budgets count
unpaid labour and machinery ownership, small grains and sorghum rarely cover that, and the
planner has no option to leave a field in pasture, hay or fallow. Read a negative plan as "none
of the modelled crops pays here", not as a recommendation.

An earlier run on 9,969 fields with four crops and Iowa costs everywhere closed 88 % of the gap
(optimum 410.5, learned 404.9, year-by-year rule 363.3). It is not comparable: the costs, crops
and fields differ, and its county yields contained the zero-yield error described under Limits.

### Checked against real fields

The test replays the outcome years 2021–2023 on 1,200 sampled fields (3,594 field-years), using
two scripts:

- `scripts/hindcast_fields.py` plans each outcome year Y as in the autumn of Y − 1: the
  field's CDL labels, seasons and irrigation maps from Y on are hidden, yields are the trend
  through Y − 1 and prices are those known then (see The planning year). It takes the
  planner's crop for Y from the exact optimum of the field's table, which the trained policy
  approximates. The outcome of Y comes from a second model that sees Y, priced at the real
  marketing-year price of Y (the US price where the state's series stops early, as Iowa's wheat
  does). The results below are from the v6 code of 15 November 2026, with the potato and rice
  gates.
- `scripts/validate_against_fields.py` compares that crop with what the field and its
  neighbours grew and earned. The neighbours are 120,276 fields of 25 acres or more from the
  FieldSense `usa_sample_v3` sample. Results are in
  `data/local/planner/validation_v6/report.json`.

No field has a measured yield, so a field's yield is estimated from its MODIS peak NDVI:

- the estimate is the county's NASS yield plus a slope × (the field's NDVI − the mean NDVI of the
  county's fields of that crop that year);
- only corn and soybeans have county yields here;
- the county mean NDVI explains 46 % (corn) and 56 % (soybeans) of the spread of NASS county
  yields;
- crops are CDL labels: satellite estimates, not farmer records.

| Test                                                                                                                                                                                                                    | Result                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Picks the crop the farm grew (2,345 field-years where the planner models that crop)                                                                                                                                     | planner 26 %, best single year 35 %, repeat last crop 38 %, corn–soybean rotation 50 %; the county's most common crop after the same crop gets 61 % (of all 3,577)                   |
| Planner picks corn or soybeans; neighbours in the same county and year that came off the same crop, median 28 farms (343 field-years). Did those that grew the planner's crop earn more than those that grew the other? | yes in 50 % of cases, by 23 USD/acre on average (median 2); going with the neighbours' majority: 50 %                                                                                |
| Expected corn − soybean cash against the difference those neighbours realised (626 field-years)                                                                                                                         | sign right 45 %, correlation −0.15, mean absolute error 239 USD/acre; within a year (the year's mean taken out) correlation 0.35: 0.40 in 2021, 0.50 in 2022, 0.23 in 2023           |
| The model's yield of the year for the crop grown against the field estimate                                                                                                                                             | corn 9.0 % mean absolute error (the plain county yield: 7.1 %), soybeans 13.6 % (12.1 %); the model's field adjustments do not move with the field's greenness (r = 0.03, 0.00)      |
| Corn after soybeans against corn after corn                                                                                                                                                                             | observed +0.4 %, planner +4.7 %. NDVI saturates in corn canopies, so the estimate cannot see this effect.                                                                            |
| Soybeans after corn against soybeans after soybeans                                                                                                                                                                     | observed +6.8 % between fields of a county and year, +1.1 % within the same fields; planner +11.1 % (FieldSense's soybean repeat factor 0.88–0.92, with cyst nematode points on top) |

The earlier run, which hid only the CDL labels and let the model draw the outcome year among
about 45, scored 63 % against the neighbours' 54 % and a correlation of 0.39. Most of that came
from the leak. Planned ex ante, the corn − soybean call is a coin toss across years, because the
year's price surprise moves every field the same way and the hindcast forecasts it from the
September price of Y − 1:

- 2021 was planned on September 2020's low corn price: expected −55 USD/acre for corn over
  soybeans, realised +160.
- 2023 was planned on September 2022's high one: expected +258, realised −99.

Within a year the model ranks the fields the right way round (0.35).

**With USDA's outlooks (v7).** The live plan uses USDA's November WASDE and baseline (see The
planning year). The archived ones of 2020–2022 are now on file, so the same 3,594 field-years
were planned again with the outlooks known each autumn. Results are in
`data/local/planner/validation_v7/report.json`.

| Test (corn − soybean call: 626 field-years; first-year cash: where planner and farm differ) | September price (v6) | USDA outlook (v7) |
| ------------------------------------------------------------------------------------------- | -------------------- | ----------------- |
| Planner's crop earned more than the other, among neighbours                                 | 50 %                 | 51 %              |
| Sign of the expected corn − soybean difference right                                        | 45 %                 | 46 %              |
| Correlation, expected against realised                                                      | −0.15                | −0.06             |
| Correlation within a year                                                                   | 0.35                 | 0.36              |
| Mean absolute error, USD/acre                                                               | 239                  | 199               |
| Expected corn − soybean, 2021 / 2022 / 2023 (realised +160 / +96 / −99)                     | −55 / +136 / +258    | −24 / +54 / +166  |
| Planner − farm, first-year cash, mean (median), USD/acre                                    | +87 (60), 1,736      | +95 (70), 1,785   |
| Myopic − farm, mean, USD/acre                                                               | +85                  | +105              |
| Picks the farm's crop                                                                       | 17 %                 | 16 %              |
| Iowa / Illinois / Ohio, planner − farm                                                      | −262 / −123 / −60    | −242 / −121 / −81 |

The outlooks cut the forecast error by a sixth. The 2023 miss on corn over soybeans falls from
357 to 265 USD/acre, while 2022 turns from 40 over to 42 under. The corn-or-soybean call still
does not beat the neighbours' majority (50 %), and the Corn Belt losses stay. So in the Corn
Belt the September price was not the main cause. The risk and rotation credits that move the
planner off corn are the next thing to calibrate; the risk weight (20 USD per point) is a guess.
The planner picks cotton more often (281 against 184 field-years) and corn less (736 against
829).

Where the planner parts from the farms:

- **Alfalfa and winter wheat:** it picks alfalfa on 26 % of field-years (the farms: 7.5 %) and
  winter wheat on 12 % (7.4 %). Corn is 23 % (22 %) and soybeans 17 % (19 %); oats 2 %.
- **Long-run choices:** on 859 of 3,577 field-years the multi-year optimum differs from the best
  single year. It gives up 145 USD/acre of expected first-year cash for rotation, soil-carbon
  (50 USD/t) and risk-point credits that pay later.
- **The actual year:** the model's own accounts use that year's yields, prices and costs. In them,
  where the two differ (1,736 field-years), the planner's crop earns 87 USD/acre more than the
  farm's on average (median 60, ahead on 60 %; 161 before the gates). It earns less in Iowa (−262), Indiana (−138),
  Illinois (−123) and Ohio (−60), where it trades corn for winter wheat and alfalfa.
- **Its largest gains** are where its inputs are weakest: alfalfa in California (+940), New
  Mexico (+722) and Washington (+634), and rice in the Sacramento Valley (+778); see below and
  the strategy check. With the gates, Wisconsin fell from +1,162 to +144 and Michigan from +784
  to −34 USD/acre.
  Contracts, processors, water rights and equipment, which the model does not know, also keep
  farms off some of these crops.

So, planned ex ante, the planner neither predicts what farms grow nor beats the neighbours'
majority on the corn-or-soybean call. Within a year it ranks fields about right, its field-level
yield adjustments are not borne out by greenness, and it diverges most where its budgets are
least verified.

Where the inputs changed (outcome years 2021–2023, model accounts of the year; v6 with the
gates, v5 before them):

| Crop and place                           | Planner picks, v6 (v5) | Farms grew | Both, v6 (v5) | Planner − farm, USD/acre, v6 (v5) |
| ---------------------------------------- | ---------------------- | ---------- | ------------- | --------------------------------- |
| Rice, California                         | 39 of 147 (134)        | 3          | 3 (3)         | +778 (+1,060)                     |
| Rice, AR, LA, MO, MS, TX                 | 29 of 561 (36)         | 24         | 2 (2)         | −172 (−158)                       |
| Alfalfa, AZ, CA, NM, NV, UT              | 190 of 285 (95)        | 56         | 29 (21)       | +677 (+429)                       |
| Potatoes, ID, ME, MI, MN, ND, OR, WA, WI | 29 of 840 (74)         | 16         | 6 (6)         | 2 field-years only (+3,435)       |
| Cotton, 13 cotton states                 | 184 of 1,080 (182)     | 121        | 10 (10)       | +324 (+324)                       |

- **Rice** is now offered only in the 119 rice counties: in California, 39 field-years in the
  Sacramento Valley against 134 across the state before. It is still picked where the farms grew
  it on 3.
- **Potatoes** are now planned on irrigated fields and in the dryland states (Maine 26 of the 29
  picks), and agree with the farms as often as before (6).
- **Desert alfalfa** took most of the California field-years rice left: 190 picks against 95,
  with 29 on fields that grew it (21 before). Its gain over the farm's crop, +677 USD/acre, rests
  on the alfalfa budgets and county hay yields, which no field record checks. It is the largest
  unverified gain left (see the strategy check below).
- **Cotton** is priced with its cottonseed, and the planner picks it about as often as the
  farms grow it, though rarely on the same fields.

Limits of this check:

- The yield estimate has the county yield at its centre, which favours the plain county yield
  in the yield test.
- MODIS pixels are 250 m, so they mix small fields with their neighbours.
- There are three outcome years only, so the across-year numbers rest on three price surprises.
- Still not fully ex ante: the cost budgets are today's moved by the year's cost index,
  the satellite crop, soil and greenness layers are today's. The tables above are from the
  September-price forecast (v6); the run with USDA's archived outlooks (v7) is compared above.
- Each field plans over at most 5 crops, its state's most grown among those it can use
  (`MAX_CROPS`).
- 444 crop-years of the outcome side (Iowa wheat and other states whose price series stops
  early) were re-priced at the US price after the run, with the fix now in `hindcast_fields.py`;
  the planner's choices did not change.
- It tests the exact optimum of the current model, not the trained `policy_usa_v6`.

### Strategy check: fields that followed the plan

`scripts/strategy_check.py` asks whether neighbours that grew the planner's three-year strategy
did better than those that did not. Each of the 1,200 sampled fields is planned as in the
autumn of 2020 (as in the hindcast). The optimal policy gives a probability for each crop
sequence of 2021–2023, because later choices depend on the year drawn. The neighbours are the
fields of 25 acres or more in the same county that grew the same crop in 2020.

Each sequence is priced on the field as 2021–2023 turned out:

- the observed county (else state) yield of each year;
- the field's rotation and establishment effects from the rule model;
- the realised marketing-year price, in constant dollars;
- the year's budget cost.

All sequences use the same tillage and cover per crop, so they differ by crop only.
`scripts/strategy_report.py` summarises the result.

The plan's prices are the USDA outlooks of autumn 2020: the February 2020 baseline moved by the
November 2020 WASDE, in constant dollars, as the live plan uses them. The results are in
`data/local/planner/strategy_v7/report.md`. The September-price forecast of the first run is in
`data/local/planner/strategy/report.md`, shown in brackets.

1,198 fields were planned and 852 have priced neighbours. USD/acre, summed over 2021–2023:

| Plan includes                    | Fields    | Plan          | Neighbours' mean | Farm's own | Plan beats, of neighbours | Fields with followers | Followers vs others  |
| -------------------------------- | --------- | ------------- | ---------------- | ---------- | ------------------------- | --------------------- | -------------------- |
| All                              | 852       | 569 (546)     | 301              | 317        | 62 % (60 %)               | 147 (136)             | 793 vs 405, 90 % win |
| Alfalfa, West                    | 91 (94)   | 1,615 (1,585) | 894              | 965        | 61 % (59 %)               | 24 (23)               | 1,816 vs 1,040, 88 % |
| Alfalfa, elsewhere               | 223 (212) | 286 (271)     | −28              | 87         | 76 % (74 %)               | 22 (21)               | 669 vs 48, 95 %      |
| Rice                             | 11 (33)   | 1,513 (789)   | 634              | 559        | 82 % (66 %)               | 1 (8)                 | 446 vs −4            |
| Potatoes                         | 4         | 5,426         | 2,116            | 3,163      | 100 %                     | 0                     | none                 |
| Corn Belt (IA IL IN MN MO NE OH) | 178 (181) | 496 (496)     | 662              | 663        | 29 % (28 %)               | 27 (24)               | 826 vs 702, 74 %     |

The groups are exclusive, in the order shown. Keeping only sequences whose three yields are
all observed (672 fields) changes little.

The USDA outlooks hardly change the result. The February 2020 baseline (corn 3.40 USD/bu
nominal for 2021) moved by the November 2020 WASDE (4.00) gives 4.51 USD/bu in 2025 dollars for 2021. The September-price forecast gave 4.39; corn realised 7.13. USDA did not see the 2021–2022
rise either. Rice is planned on a third as many fields, because the outlook rice price is lower
than the September forecast.

Expected prices as known in the autumn before, against the realised marketing-year price (2025
dollars; `prices.expected_us_price`):

| Crop, unit       | Year | USDA outlook | September price forecast | Realised |
| ---------------- | ---- | ------------ | ------------------------ | -------- |
| Corn, USD/bu     | 2021 | 4.51         | 4.39                     | 7.13     |
|                  | 2022 | 5.20         | 5.95                     | 7.19     |
|                  | 2023 | 6.04         | 6.77                     | 4.81     |
| Soybeans, USD/bu | 2021 | 11.20        | 11.44                    | 15.80    |
|                  | 2022 | 12.39        | 13.53                    | 15.62    |
|                  | 2023 | 13.32        | 14.31                    | 13.10    |
| Rice, USD/cwt    | 2021 | 15.49        | 16.67                    | 19.13    |
|                  | 2022 | 15.45        | 16.56                    | 21.78    |
|                  | 2023 | 18.99        | 18.43                    | 18.28    |
| Cotton, USD/lb   | 2021 | 0.78         | 0.71                     | 1.09     |
|                  | 2022 | 0.92         | 0.82                     | 0.93     |
|                  | 2023 | 0.79         | 0.86                     | 0.80     |

The outlook is closer in 2023 (corn, soybeans, cotton) and further off in 2022 for corn,
soybeans and rice. Neither forecast saw the 2021 jump.

What this shows and what it does not:

- **Where the inputs are best, the farms win.** In the Corn Belt the planner's sequences beat
  only 28 % of the neighbours, and earn 165 USD/acre less than the neighbours' mean over three
  years. The farms' corn and soybeans gained from the high prices of 2021–2022. The planner,
  planning on the September 2020 price, traded them for winter wheat and alfalfa. This matches
  the one-year check (Iowa −262 USD/acre).
- **Where the gains are large, few farms followed.** In the West a neighbour grew one of the
  plan's sequences on 23 of 94 fields. Elsewhere alfalfa had 21 of 212, rice 8 of 33 and
  potatoes none. Where neighbours did follow, they earned more than the rest. Both sides are
  priced on the same field by the same model, though, so this tests the forecast (expected
  against realised yields and prices), not the budgets.
- **The test cannot check the budgets.** The plan's lead in the West rests on the alfalfa
  establishment and hay budgets and on county hay yields. Half of the western neighbours'
  sequences cannot be priced, because they include vegetables, orchards and other crops outside
  the field's plannable set. Farms that do not take a 700 USD/acre gain probably face what the
  model leaves out: water rights, hay contracts and markets, equipment and labour.
- **Potatoes and rice remain thin:** 4 and 33 fields.

Limits: costs are budgets, not farm records; the rotation and establishment effects are the
model's; yields are county or state means; crops are CDL labels (satellite estimates); and
each field plans over at most 5 crops, its state's most grown among those it can use
(`MAX_CROPS`), as in the trained policy.

## Week-by-week plan

`weekly.py` plans on a clock of weeks instead of years, so a plan says when to plant, not only
what, and a short crop can leave room for a cover crop or a second crop.

```sh
python -m rule_engine.planner.weekly --field 171825000041665 \
    --fields data/local/usa_sample_v2/fields.jsonl \
    --summaries data/local/usa_sample_v2/work/season_summary \
    --gridmet data/local/usa_sample_v2/work/gridmet \
    --start 2026-11-15 --years 3
```

The module uses this repo's rule engine, whose catalog has only the original crops. To plan with
the new crops (durum wheat, cotton, peanuts, rice, sugarbeets, potatoes, dry peas, lentils,
chickpeas, flax, millet), run `scripts/weekly_plan.py --rule-engine <other checkout>/rule_engine`
with the same options.

### How it works

- A decision is taken only in a week in which the field is free: plant a crop (with a tillage
  system), seed a rye cover, or wait a week.
- A planted crop sends the clock forward to its harvest. The harvest date is replayed in every
  past season of the field's daily weather (gridMET, 1981–2025): maturity comes after the state's
  usual heat sum or number of days, whichever predicted that state's seasons better
  (`data/crop_heat_units.csv`, built by `scripts/build_heat_units.py` from USDA NASS Crop Progress).
  Maturity is the first NASS stage that marks it: mature (corn, sorghum, rice), dropping leaves
  (soybeans, dry peas), bolls opening (cotton), dug (peanuts) or vines dry (potatoes); otherwise
  the harvest. Base temperatures are 10 °C for the warm-season grains and peanuts, 15.6 °C (60 °F)
  for cotton, 7 °C for potatoes, 1.1 °C for sugarbeets and 0 °C for the small grains, pulses and
  flax.
  An autumn frost ends a warm-season crop early and cuts its yield.
- Past seasons are replayed in today's climate: each year's temperatures are moved along the
  field's own linear trend to the start year (`--keep-climate` turns this off).
- Planting later than usual costs yield, from planting-date trials
  (`data/planting_date_response.csv`). A date is offered only where the crop matured in at least
  80 % of the past seasons.
- Money per crop (revenue, cost, rule points, weather penalty) comes from the yearly model above.
- A calendar year without a harvest enters the crop history as fallow.
- The plan is solved exactly by backward induction; a three-year plan takes about 5 seconds and
  1.1 GB per field, most of it reading the weather.

### What a plan is scored on

Each strategy is reported on every term, per year of the plan:

| Term                      | Unit        | Source                                                                |
| ------------------------- | ----------- | --------------------------------------------------------------------- |
| Cash                      | USD/acre    | revenue minus cost, land excluded                                     |
| Rules and weather penalty | USD/acre    | rule points at `risk_usd_per_point`, weather risk                     |
| Soil carbon change        | t C/ha      | the carbon model above; not scored above 20 % organic matter          |
| Soil loss                 | t/ha        | USLE (OMAFRA factsheet 23-005) with the field's erodibility and slope |
| Water shortfall           | mm per crop | FAO-56 crop need minus rain and stored soil water                     |
| Nitrogen left by legumes  | kg/ha       | `data/weekly_crops.csv`                                               |

The score is cash minus the penalty, plus soil carbon at `--soil-usd-per-t-c` (default 50) and
minus soil loss at `--erosion-usd-per-t` (default 5). Water and nitrogen are shown but not priced.

Four strategies are compared: `current_rotation` (the field's own rotation, full tillage, no
cover crop), `cash_first` (soil priced at zero), `balanced` (the given prices; this is the plan)
and `soil_first` (soil priced four times higher).

**Example** (Illinois field 171825000041665, corn and soybeans, 4 % slope, from 15 November 2026):

| Strategy         | Sequence                                   | Cash  | Penalty | Carbon | Soil loss       | Score |
| ---------------- | ------------------------------------------ | ----- | ------- | ------ | --------------- | ----- |
| current rotation | soybeans, corn, soybeans, all fully tilled | 217.1 | 70.5    | +0.75  | 35.5 (severe)   | 96.7  |
| cash first       | soybeans, corn, soybeans, all no-till      | 239.2 | 37.2    | +0.76  | 11.3 (moderate) | 201.2 |
| balanced         | the same with a rye cover each autumn      | 207.5 | 11.1    | +0.97  | 10.1 (low)      | 202.3 |
| soil first       | as balanced, corn a week earlier           | 207.2 | 10.8    | +0.97  | 10.1 (low)      | 202.3 |

The balanced plan plants soybeans on 2 May 2027 (harvest most likely 11 October), seeds rye on
17 October, plants corn on 30 April 2028, seeds rye again and plants soybeans on 6 May 2029.

### Limits of the weekly plan

- Every parameter that is an assumption is marked `verified=false` in `data/weekly_parameters.csv`.
- Soil loss is an order of magnitude: the slope length is assumed (50 m), rain erosivity comes
  from annual rain by a recalled formula, and support practices are not counted. The rules already
  penalise erosion-prone choices, so part of it may be counted twice.
- Waiting is free. Where every crop loses money on its full budget, the cash-first plan is to
  plant nothing, and an idle field is treated as the bare stubble of its last crop.
- A second crop in one year counts as a year in the crop history, and double-crop soybeans use the
  full-season budget. No strategy chose a second crop on the fields tried.
- Each crop's season is drawn independently of the previous one. Soil carbon does not feed back
  into yield inside the plan. Yields are not re-derived under the warming shift; only dates are.
- Only corn, soybeans and the small grains have planting-date trials; every other crop is
  offered up to three weeks after the usual day at full yield (`no_planting_date_response`).
  Alfalfa is seeded in spring only. Growing time is borrowed from another state where NASS
  reports no progress for the crop: millet and lentils have one state each (CO, MT), flax two.
- NASS reports peanuts dug but not threshed in some states, and potato vines dry in only some; there
  the harvest lag is 0 or maturity is the harvest.
- Minimum return intervals are enforced only where `data/crop_adjustments.csv` has one
  (sugarbeets and flax: two other crops in between); other crops can repeat at the cost of their
  measured repeat-crop yield loss and rule points.
- The field is assumed free at the start date. Seasons after the last CDL year are filled from the
  field's own rotation unless `--grown` declares them.
- There is no learned weekly policy and no national weekly table yet; each field is solved alone.

## Where each number comes from

- **Yield.** The expected yield today (county trend for corn and soybeans, state series for other
  crops) × that year's observed anomaly × the rule engine's rotation yield factors. An observed
  yield already contains that year's weather. When a year has no observed yield, the anomaly is
  modelled from the season's hazards with `data/weather_yield_response.csv`.
- **Price.** The expected price of the plan year (The planning year and the price outlook) ×
  that year's marketing-year price in constant dollars (CPI-U, `data/cpi_u.csv`) over its
  log-linear trend. `data/nass_long_history.csv`
  (`scripts/fetch_long_history.py`) holds state and national prices since 1980. Cotton is priced
  by its lint × (1 + cottonseed share): ERS counts the seed in cotton's gross value and its costs
  include ginning. The share is the ERS region's mean of cottonseed value over lint value (0.18
  to 0.24; `data/byproducts.csv`, `scripts/build_byproducts.py`).
- **Cost.** `data/costs_regional.csv`: USDA ERS Commodity Costs and Returns 2025, total costs
  minus the opportunity cost of land, for the field's ERS farm resource region
  (`data/ers_regions.csv` maps counties to regions; `scripts/build_regional_costs.py` builds the
  table). A crop without a row for the region uses the US total, marked unverified; where ERS
  stopped reporting the region within the last five years (peanuts and oats in the Prairie
  Gateway after 2022) the US total is scaled by the region's mean ratio to it over its last three
  years, also unverified (`tables._lapsed_regions`).
  - _Rice and peanuts_ have ERS regions of their own (`tables.crop_region`). Rice: California,
    Gulf Coast, Mississippi River Delta and Arkansas Non-Delta, per county from
    `data/rice_regions.csv` (`scripts/build_rice_regions.py`). ERS publishes descriptions, not
    county lists: Texas, Mississippi, NASS's Southwest and Northeast Louisiana districts and the
    Arkansas Grand Prairie follow them (verified). The other counties are unverified: those on
    the Mississippi River are Delta (ERS's pre-1995 "River Counties"), the rest take the
    region of the EPA ecoregion that holds most of their CDL rice acres (Western Gulf Coastal
    Plain, Grand Prairie and Western Lowlands, the rest of the Mississippi Alluvial Plain;
    `data/rice_ecoregions.csv`, `scripts/build_rice_ecoregions.py`). Peanuts: the Southern Seaboard splits into
    AL–GA and VA–NC–SC; Florida and Mississippi take AL–GA, unverified.
  - _Crops ERS does not cover_ (sugarbeets, potatoes, dry peas, lentils, chickpeas, flax, millet):
    extension budgets in `data/costs_extension.csv`, the state's own row first, then the region's,
    then the national row (unverified).
  - _Tillage._ `data/costs_tillage.csv`: custom rates per ERS region from state extension surveys
    (2024–2026). The cost difference between tillage systems is the difference between their
    field passes at those rates, for every crop:

    | Crops                         | `conventional`                   | `strip_till`           | `no_till`                                  |
    | ----------------------------- | -------------------------------- | ---------------------- | ------------------------------------------ |
    | corn, soybeans, sorghum       | chisel + field cultivate + plant | strip-till + plant     | no-till plant + spray + burndown herbicide |
    | small grains, alfalfa seeding | disk + field cultivate + drill   | disk + drill (reduced) | no-till drill + spray + burndown herbicide |

    A rate the region's survey lacks is the mean of the other regions, marked unverified. Only two
    regions have a burndown herbicide price, so `no_till` is unverified in the other seven.

  - _Alfalfa._ ERS has no alfalfa budget. `data/costs_alfalfa.csv` holds extension budgets for
    the seeding year and for an established stand, per ERS region and for Arizona and California
    (irrigated desert); the state's row is used when there is one. Land and the amortised
    establishment charge are taken out. The budget is moved to the field's expected yield at the
    custom baling rate per ton. Regions without a budget of their own borrow a neighbour's,
    marked unverified. An established stand has no tillage difference. The seeding-year yield is
    the field's own seeding budget's yield over its established budget's (`CostTable.
seeding_year_yield`), so cost and yield assume the same harvest: 0.625 in the Heartland, 0.5
    in the Northern Crescent, 0.67 in the Fruitful Rim and 1.0 for fall-seeded desert stands in
    Arizona and California. Where the establishment budget harvests no hay (Colorado, Tennessee
    budgets), the 0.625 of `crop_adjustments.csv` applies and the baling of that hay is added.
  - _Corn after corn._ `data/costs.csv` (Iowa State University) supplies the difference from
    corn after another crop, everywhere.
  - The budgets and surveys are from 2023–2026 and are not deflated to one year.
  - Cover crops: `data/cover_costs.csv`.
  - _Year._ The cost moves with the drawn year: the 2025 cost × that year's ERS operating plus
    overhead cost for the region, in constant dollars, over its mean across all years
    (`CostTable.year_index`, from `data/costs_regional_history.csv`; mean 1, like prices).
    Crops without an ERS history, such as alfalfa, keep one cost (`cost_same_every_year`).
  - _Irrigation._ `data/irrigation_costs.csv` (`scripts/build_irrigation_costs.py`) holds a
    year's cost of irrigating an acre per state, 2025 dollars: pumping energy (IWMS 2023 Table
    16), off-farm water (Table 18) and scheduled replacement or maintenance of the equipment
    (Table 19), each per irrigated acre of the state (Table 3); hired and contract labour for
    irrigation (Table 20) per acre irrigated on the farms that have any (Nebraska 12.41, Kansas
    17.00, California 197.72; the UNL pivot budget has 15.83, the K-State 2027 south-west Kansas
    pivot budget 13.38); and interest on the equipment (24.50) from the UNL 2026 electric
    centre-pivot budget, the same in every state. U.S. mean 230.90, against 70.14 for energy
    alone. A budget already holds part of it:
    an ERS budget the Census 2022 irrigated share of the crop's acres in its region
    (`data/irrigated_shares.csv`, `scripts/build_irrigated_shares.py`; Heartland corn 0.08,
    Prairie Gateway corn 0.41, rice 1), an extension budget all or none (its `irrigated` column).
    An irrigated field adds (1 − share) × the cost, a dryland one takes off share × the cost, a
    field of unknown status neither (`CostTable.irrigation_cost`, gap `irrigation_cost_estimated`).
- **Risk penalty.** Rule engine points × `Weights.risk_usd_per_point`. A finding that carries a
  yield factor is paid through yield and its points are not counted again. Neither are those of
  a rule whose damage a measured yield factor already holds (`adapter.MEASURED_BY`): cyst
  nematode points on soybeans after soybeans, once the rule engine has a soybean repeat yield
  factor (FieldSense `soy_after_soy_yield_penalty`), and the `return_interval_violated` points
  wherever a measured repeat or short-break factor fires (corn, soybeans, peanuts, potatoes,
  sugarbeets, pulses, flax).
- **Irrigation and yield.** Where NASS splits a state's yield into irrigated and non-irrigated
  acres (`yield_irrigated`, `yield_dryland` in `data/nass_long_history.csv`), the field's yield is
  scaled by its practice's ratio to the all-practice state yield (`irrigation.practice_ratios`;
  Nebraska corn: irrigated 1.15, dryland 0.73). An irrigated field takes no modelled drought loss.
  The status is a Landsat classification (LANID-US, IrrMapper), not a farmer record; fields
  without one get dryland yields and the budget's own irrigation mix in cost, and are reported as
  `irrigation_status_unknown`.
- **Soil carbon.** A two-pool yearly model (`dynamics.SoilCarbon`) fed by residue from
  `data/soil_carbon.csv`, valued at `Weights.soil_usd_per_t_c` (50 USD per tonne of carbon). The
  starting stock is scaled by the soil's bulk density where SSURGO has it (1.3 g/cm³ otherwise).
- **Soil loss.** USLE sheet and rill erosion of the season (`erosion.YearlySoilLoss`): rain
  erosivity from the field's mean annual rain (the April–October sum ÷ 0.70), SSURGO K factor,
  slope and slope length, the crop's C factor × its tillage factor, and a cover crop's protection
  before planting. Charged at `Weights.erosion_usd_per_t` (5 USD per tonne). Uncalibrated.

The weights are preferences, not data. Every table row has a `verified` column and a source.

## Building the earlier years

The planner draws from 1981–2025. For the 30,000-field sample every year is built the same way
(`fetch_gridmet_history.sh` downloads the gridMET files for the first sample):

```sh
S=data/local/usa_sample_v2
python data/usa_sample/gridmet.py --fields $S/fields.csv --cache <gridMET files> \
    --out $S/work/gridmet --years $(seq 1981 2025)                        # weather at each field
python data/us_drought_monitor/csb_drought.py weekly --points $S/fields.csv \
    --start 2000-01-01 --end 2025-12-31 --cache <weekly maps> --out $S/work/usdm/weekly_all.parquet
python rule_engine/planner/scripts/fetch_county_yields.py --start 1978 --end 2025 \
    --out $S/yields                                                       # NASS county yields
python rule_engine/planner/scripts/build_history_summaries.py \
    --sample $S --work $S/work --years $(seq 1981 2025)
```

The sources do not all reach 1981:

| Source                               | First year | Before that                                   |
| ------------------------------------ | ---------- | --------------------------------------------- |
| gridMET weather, NASS yields, prices | 1981       |                                               |
| RMA cause of loss (previous year)    | 1990       | empty                                         |
| Drought Monitor                      | 2000       | no drought signal; year odds use price only   |
| Previous crop from CDL               | 2018       | empty (the plan uses the field's own history) |

## Extra field data

These scripts take `--fields` as the planner's `fields.jsonl` or a sampler's `fields.csv`
(`scripts/field_pool.py`). Their outputs go to `data/local/planner/`, which git ignores. All of
them are satellite classifications or map-unit estimates, not farmer records. The irrigation
status and the soil profile enter the model; greenness and NCCPI are network inputs only
(`tabular.STATIC_NAMES`), so the policy can use them but the reward does not.

| Script                              | Writes                                             | Covers                                                                                                                           |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/fetch_irrigation.py`       | `irrigation/irrigation*.parquet`                   | irrigated or not per field and year: LANID-US 1997–2017 (whole US), IrrMapper v1.2 1985–2025 (11 western states)                 |
| `scripts/fetch_modis_greenness.py`  | `greenness/modis/<year>.parquet`, `yearly.parquet` | MODIS NDVI every 16 days at 250 m, 2000 and 2002–2023 (the public copy lacks 2001 and 2024–2025)                                 |
| `scripts/fetch_soil_profile.py`     | `soil/mukey_profile.csv`                           | USLE slope length and 0–30 cm bulk density per SSURGO map unit, weighted over its major components (Soil Data Access)            |
| `scripts/fetch_field_series.py`     | `greenness/fields/<id>/`                           | HLS 30 m NDVI, EVI and NDWI for every clear view since 2020, plus true-colour pictures, for chosen fields                        |
| `scripts/build_regional_costs.py`   | `data/costs_regional_history.csv`                  | ERS costs, gross value, yield and price by farm resource region and year, 1995/96–2025 (nominal dollars)                         |
| `scripts/build_rice_ecoregions.py`  | `data/rice_ecoregions.csv`                         | share of each county's CDL rice acres in the EPA ecoregions standing for the ERS rice regions                                    |
| `scripts/build_rice_regions.py`     | `data/rice_regions.csv`                            | ERS rice cost region of each rice county (Census 2022)                                                                           |
| `scripts/build_irrigation_costs.py` | `data/irrigation_costs.csv`                        | cost of irrigating an acre per state: energy, off-farm water, upkeep, labour, interest (IWMS 2023, UNL 2026)                     |
| `scripts/build_irrigated_shares.py` | `data/irrigated_shares.csv`                        | irrigated share of each ERS crop's harvested acres per ERS cost region (Census 2022)                                             |
| `… --historical <folder>`           | `data/costs_early_history.csv`                     | the older ERS accounts, 1975 to the mid 1990s, for the U.S. and broad regions; a different scheme, not one series with the above |

Deflating today's ERS cost with CPI-U matches the published cost within about 7 % from 2009 on
but overstates 1995–2007 costs by 25–30 %. There is no irrigation status for 2018–2025 outside
the western states.

## Limits

- Crop history is a satellite estimate (USDA CDL/CSB), not a farmer's declaration. The plan output
  repeats this under `dataGaps`.
- Tillage cost differences count field passes and one burndown herbicide only. They leave out
  any change in fertilizer, seed or in-season herbicide between systems, so no-till comes out
  USD 7–27 per acre cheaper than conventional tillage for row crops in every region. The
  Basin and Range rates are from an eastern Colorado survey, and the Fruitful Rim has no planting
  or drilling rates (`cost_unverified` under `dataGaps`).
- The corn-after-corn cost difference comes from Iowa and is applied everywhere. The Northern
  Great Plains, Southern Seaboard, Mississippi Portal and California alfalfa budgets are borrowed
  from Iowa, Tennessee and Arizona. The ERS wheat budget serves both winter and spring wheat.
- There is no idle, pasture or hay option, so hay, pasture and vegetable fields get a poor or
  negative plan.
- Sugarbeet and potato costs rest on few budgets (two to four each; the potato budgets are from
  2019, moved to 2025 with CPI-U). A search in 2026-11 found no newer independent potato,
  sugarbeet or chickpea budget.
- The USLE C factors of peanuts (NRCS Oklahoma RUSLE tables), rice and sugarbeets (Panagos et
  al. 2015, European land-cover values) come from outside the field's region.
- Residue inputs (`data/soil_carbon.csv`) are from Bolinder et al. 2007, the IPCC 2019 Table
  11.1a and the USDA 2024 GHG methods report (Ch. 3, Table 3-3: cotton, alfalfa and grass hay,
  and the root ratios of peanuts and millet; cotton is per tonne of lint through the NASS
  lint-to-cottonseed ratio, 0.44). Unverified: sugarbeets (Bolinder et al. 2015 read through the
  SoilManageR package). Flax, rye, canola and triticale take the small-grain mean.
- Cross-check of the residue rows against NASA MODIS (MOD17A3HGF v061 net primary production
  2021–2023 at the centroids of CDL fields of 200+ acres, against NASS state yields): MODIS NPP is
  compressed (about 250–590 g C/m² for every crop) and runs at 0.35–0.40 of the implied input
  on high-yield irrigated crops and above 1.3 on dryland ones, so it cannot check absolute
  values. Only ratios of two crops in the same states were used. Sugarbeets to corn: MODIS 0.95,
  this table 1.03, USDA Table 3-3 1.94, so USDA's sugarbeet row (about 47 t of dry matter per
  hectare) was not used. Pulses to wheat: MODIS about 0.95, the IPCC rows 0.6–1.1, USDA's beans
  row 0.3–0.6, so the IPCC rows were kept. Cotton, alfalfa, hay and millet: both sources are
  within MODIS's spread.
- Irrigation labour is a state mean over every irrigated crop, so it is high where orchards and
  vegetables are irrigated (California). Equipment interest is one Nebraska centre-pivot budget
  applied in every state and to flood and furrow systems too. The survey's upkeep is one year's outlay: it is
  lumpy by state (Georgia 124 per acre, Arkansas 9) and below the pivot budget's depreciation and
  repairs (60.81). Water rights held with the land are in the land's value, which is left out
  like all land costs. The irrigated and dryland yield ratios are state ratios applied to
  county yields; Iowa and other states without a NASS split get none.
- The cost level of a year is normalised over the whole ERS history, not over the years drawn.
- Dry peas, lentils and flax use one North Dakota budget each (NDSU 2026), millet one Nebraska
  Panhandle budget (UNL 2026), and chickpeas the lentil budget times the Saskatchewan 2026
  chickpea-to-lentil cost ratio (unverified); outside the Northern Great Plains they are
  unverified. NDSU's 2026 regional budgets spread by 30 USD per acre for dry peas, 4 for lentils
  and 40 for flax, which gives a sense of the error. NDSU's millet (149–161 before land) is below
  UNL's 209, which also counts labour and real-estate tax. Their C factors are taken from analogue crops.
- Sugarcane is in the rule engine catalog but not planned here: its multi-year stand (plant
  cane, ratoons, fallow) is not modelled.
- Slope lengths over 305 m are capped there (`slope_length_capped`).
- In the week-by-week planner, chickpeas use the lentil growing time (NASS has no chickpea
  progress series; gap `growing_time_from_another_crop`).
- NASS publishes a county corn yield of 0 where no grain was harvested (499 county-years,
  1998–2009). `scripts/fetch_county_yields.py` drops them; tables built before that fix treated
  them as total crop failures.
- The soil carbon parameters come from the literature and are not calibrated to these fields.
- The weather response table covers corn and soybeans only. It has no rows for spring frost, small
  grains or alfalfa.
- The year odds rest on 45 historical years (about 30 effective analog years on the example
  field). They show direction, not calibrated probabilities.
- Years since 1981 are treated as equally likely weather for the coming seasons. Yields are
  detrended, but a warming trend in the weather itself is not modelled in the yearly plan (the
  weekly plan moves temperatures along the field's trend).
- The exact plan takes about 50 seconds per field with 45 years (9 seconds with 11); from the
  tables it takes milliseconds, and building a field's table takes 1–2 seconds.
- Tabular Q-learning needs far more episodes once the state tracks the year just experienced
  (200,000 episodes reached 96 % of the exact value on the example field; 20,000 reached 84 %).
- Pest and disease pressure enters only through the rotation rules, as a deterministic effect.
- The price outlook is moved from nominal into constant dollars with the CPI of its marketing
  year (the latest table year, 2025, for a later year), the cost budgets are in 2025 dollars. Peanuts, hay, sugarbeets, potatoes, the pulses and flax have no USDA outlook. A year's
  cost index is still its real level over the history's mean, while prices are now over their
  trend, so the co-movement of costs and prices across drawn years is only approximate.
- The current year (2026) has no drought signal in the year odds until its season summary is
  built.

## Next changes

The tables of `policy_usa_v5` (built on 15 November 2026 from 20:27, trained by 22:05) take in the cottonseed
price, the cyst nematode change above, FieldSense's yield rules of that day (continuous corn
0.94–0.97, rotation benefit 1.03–1.09, soybean repeat 0.88–0.92), the price outlook and timing
rule, the irrigation labour of IWMS Table 20, the new soil carbon inputs and rice regions, and
three changes proposed by the earlier field check:

- the tables store cost, risk points, erosion and the soil term of each action, and the
  weather points and cost shift of each crop and year (`FieldTable.terms`,
  `FieldTable.reweighted`), so the weights can change without a rebuild;
- alfalfa is offered only in hay counties (above);
- the seeding year of alfalfa follows the field's own budget (above), so desert alfalfa's
  seeding year is no longer charged twice.

`policy_usa_v6` adds the two gates the v5 field check called for: potatoes only on irrigated
fields outside the dryland potato states, and rice only in rice counties (both under Crops
above). 68 of the 74 potato picks of v5 were on fields the irrigation map shows as dryland,
and the irrigation map alone let rice onto every irrigated California field (134 of 147
field-years). There was no time to rebuild before the deadline, so `scripts/gate_tables.py`
applied the gates to the v5 tables (tables_usa_v6). It removes the excluded crops' actions and
inputs, and leaves the other rewards unchanged, since a crop's reward does not depend on which
others are offered. Unlike a rebuild, a field does not get its state's next crop in the freed
slot. The gates took rice off 689 fields (591 in California) and potatoes off 521 (203 in
Wisconsin, 191 in Michigan), and dropped no field.

Still open:

1. Calibrate `Weights.risk_usd_per_point` (20, a guess) against what similar farms earned. Risk
   points and soil carbon cost corn about 73 and soybeans 59 USD/acre a year against +7 for
   alfalfa, about what a seeding year of alfalfa gives up in cash (80 USD/acre).
   `FieldTable.reweighted` gives the rewards under another weight; the policy must be retrained.
2. Perhaps also drop the white mold points on soybeans after soybeans: the measured repeat drag
   probably holds them too, but less clearly than cyst nematode.
3. Rebuild the tables with the gates, so a gated field gets its next crop in the freed slot.

North Dakota's 19 % of the gap closed (`policy_usa_v6`; 28 % in v5, 24 % in `policy_usa_v3`) is
a small denominator, not a weak policy: its exact optimum is only 26.4 USD/acre above the
year-by-year rule over five years (120.9 against 94.5), against 131.8 in Iowa and 63.9 in
Minnesota. The learned policy's mean shortfall from the optimum there, 21.4 USD/acre, is close
to that of Ohio (16.3) and Iowa (13.9) and below Minnesota's (27.3). Spring wheat, soybeans, alfalfa, the pulses
and flax are close in value, so rotation earns little and many choices are near ties. Read the
gap closed together with the shortfall in USD.
