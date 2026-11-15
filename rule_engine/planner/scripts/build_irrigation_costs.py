"""Cost of irrigating an acre for a year, by state: pumping energy, off-farm water, upkeep of the
system, labour and interest on the equipment.

    curl -o <new empty dir>/iwms.txt https://www.nass.usda.gov/sites/default/files/publications/agcensus/2022/Online_Resources/Farm_and_Ranch_Irrigation_Survey/iwms.txt
    python -I rule_engine/planner/scripts/build_irrigation_costs.py <new empty dir>/iwms.txt

Rewrites rule_engine/planner/data/irrigation_costs.csv. The components:

- energy: the existing `energy` column (IWMS 2023 Table 16, pumping energy per irrigated acre;
  see the row sources), kept as it is;
- water: IWMS 2023 Table 18, the total paid to off-farm water suppliers ($1,000), divided by
  Table 3's acres irrigated on all farms. Most irrigators pump their own water and pay nothing,
  so this is the mean over all irrigated acres, not the price where water is bought;
- upkeep: IWMS 2023 Table 19, expenditure on scheduled replacement or maintenance of irrigation
  equipment, divided by the same acres. It stands for depreciation and repairs. The survey's
  other expenditure (new expansion, water and energy conservation) is investment and left out;
- labour: IWMS 2023 Table 20, hired and contract labour expenses for irrigation divided by the
  acres irrigated on the farms that have any. Operator labour is not in it, and the state means
  hold every irrigated crop (California's orchards and vegetables put it at about 198 an acre;
  Nebraska 12, Kansas 17, Arkansas 6). Nebraska's 12.41 is close to the 15.83 of the UNL pivot
  budget and Kansas's 17.00 to the 13.38 of the K-State 2027 south-west Kansas pivot corn budget;
- interest: UNL 2026 Nebraska crop budgets, the electric centre pivot with a 125-foot lift
  (opportunity cost of the investment, 24.50 per acre at 3 %), the same in every state: the
  survey does not ask it;
- a state the survey suppresses (D) takes the U.S. value for that component.

Water rights held with the land are in the land's value, which the planner leaves out of every
cost. The survey's 2023 dollars move to 2025 with CPI-U (x 1.0566), the same as the energy column;
the UNL figures are 2026 budget estimates and are kept as they are.
"""

import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "rule_engine" / "planner" / "data" / "irrigation_costs.csv"
CPI_2023_2025 = 1.0566
UNL_INTEREST = 24.50
IWMS_URL = (
    "https://www.nass.usda.gov/sites/default/files/publications/agcensus/2022/Online_Resources/"
    "Farm_and_Ranch_Irrigation_Survey/iwms.txt"
)
UNL_URL = (
    "https://cap.unl.edu/sites/unl.edu.ianr.agecon.center-for-ag-profitability/files/media/file/"
    "2026-nebraska-crop-budgets.pdf"
)
STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH",
    "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
    "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN",
    "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY", "United States": "US",
}  # fmt: skip
ROW = re.compile(r"^([A-Z][A-Za-z ]+?) \.{2,}[0-9]*:(.*)$")


def _number(token: str) -> float | None:
    """A table cell as a number; None for (D) and other suppressed or empty cells."""
    if token == "-":
        return 0.0
    try:
        return float(token.replace(",", ""))
    except ValueError:
        return None


def table(lines: list[str], title: str, header: str) -> dict[str, list[float | None]]:
    """{state code: the row's cells} from the first page of the table whose title starts with
    `title` and whose column headings contain `header`."""
    start = None
    for i, line in enumerate(lines):
        if line.startswith(title):
            heading = " ".join(lines[i : i + 14])
            if header in heading:
                start = i
                break
    if start is None:
        raise SystemExit(f"no page of {title!r} with {header!r}")
    found: dict[str, list[float | None]] = {}
    for line in lines[start + 1 :]:
        if line.startswith("Table "):
            break
        match = ROW.match(line.strip())
        if match and match.group(1) in STATES and STATES[match.group(1)] not in found:
            found[STATES[match.group(1)]] = [_number(t) for t in match.group(2).split()]
    return found


def main(path: str) -> None:
    lines = Path(path).read_text(encoding="latin-1").splitlines()
    acres = table(lines, "Table 3.", "Land in farms")  # farms, acres, acres irrigated, ...
    water = table(lines, "Table 18.", "($1,000)")  # farms, farms reporting, total cost, ...
    upkeep = table(lines, "Table 19.", "Scheduled replacement")  # ..., acres, dollars
    with OUT.open(newline="") as handle:
        old = {r["state"]: r for r in csv.DictReader(handle)}

    labour = table(lines, "Table 20.", "contract labor")  # farms, acres, expenses ($1,000), ...

    def per_acre(
        state: str, cells: dict, column: int, scale: float, denominator: dict | None = None
    ) -> tuple[float, bool]:
        base, at = (acres, 2) if denominator is None else (denominator, 1)
        irrigated = (base.get(state) or [None] * 3)[at]
        value = (cells.get(state) or [None] * (column + 1))[column]
        if value is None or not irrigated:
            return per_acre("US", cells, column, scale, denominator)[0], False
        return round(value * scale / irrigated * CPI_2023_2025, 2), True

    rows = []
    for state, r in sorted(old.items()):
        energy = float(r.get("energy") or r["usd_per_acre"])
        water_usd, water_own = per_acre(state, water, 2, 1000.0)
        upkeep_usd, upkeep_own = per_acre(state, upkeep, -1, 1.0)
        labour_usd, labour_own = per_acre(state, labour, 2, 1000.0, labour)
        total = round(energy + water_usd + upkeep_usd + labour_usd + UNL_INTEREST, 2)
        energy_source = r.get("energy_source") or r["source"].split(". Energy only")[0]
        missing = [
            n
            for n, own in (("water", water_own), ("upkeep", upkeep_own), ("labour", labour_own))
            if not own
        ]
        source = (
            f"energy: {energy_source}; water: IWMS 2023 Table 18 total paid to off-farm water "
            f"suppliers / Table 3 acres irrigated, {water_usd} (2025 dollars); upkeep: IWMS 2023 "
            f"Table 19 scheduled replacement or maintenance / Table 3 acres irrigated, "
            f"{upkeep_usd}; labour: IWMS 2023 Table 20 hired and contract labour expenses for "
            f"irrigation / acres irrigated on farms with any hired or contract labour, "
            f"{labour_usd}; equipment interest {UNL_INTEREST}: UNL 2026 Nebraska crop budgets, "
            f"electric centre pivot, 125-foot lift, applied in every state"
            + (
                f"; {' and '.join(missing)} suppressed for the state, U.S. value used"
                if missing
                else ""
            )
        )
        rows.append(
            {
                "state": state,
                "energy": f"{energy:.2f}",
                "water": f"{water_usd:.2f}",
                "upkeep": f"{upkeep_usd:.2f}",
                "labour": f"{labour_usd:.2f}",
                "interest": f"{UNL_INTEREST:.2f}",
                "usd_per_acre": f"{total:.2f}",
                "year": "2025",
                "verified": "false",
                "energy_source": energy_source,
                "source": source,
                "url": f"{r['url'].split()[0]} {IWMS_URL} {UNL_URL}",
            }
        )
    with OUT.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    for r in rows:
        if r["state"] in ("US", "NE", "AR", "CA", "GA", "IA", "TX", "ID"):
            print(r["state"], r["energy"], r["water"], r["upkeep"], r["usd_per_acre"])


if __name__ == "__main__":
    main(sys.argv[1])
