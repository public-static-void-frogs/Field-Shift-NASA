"""The week-by-week plan of one field, modelled with another checkout's rule engine.

    python rule_engine/planner/scripts/weekly_plan.py \
        --rule-engine ../FieldSense/rule_engine --field 481825000009979 \
        --fields data/local/usa_sample_v2/fields.jsonl \
        --summaries data/local/usa_sample_v2/work/season_summary \
        --gridmet data/local/usa_sample_v2/work/gridmet --start 2026-11-15 --years 3 \
        --crops cotton sorghum winter_wheat

`python -m rule_engine.planner.weekly` uses this repo's rule engine, whose catalog has only the
original crops: durum wheat, cotton, peanuts, rice, sugarbeets, potatoes, the pulses, flax and
millet are in the FieldSense catalog. All other options are those of weekly.py.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_tables  # noqa: E402,F401  (imports rule_engine from --rule-engine)

from rule_engine.planner import weekly  # noqa: E402


def main() -> None:
    argv = sys.argv[1:]
    if "--rule-engine" in argv:
        at = argv.index("--rule-engine")
        del argv[at : at + 2]
    sys.argv = [sys.argv[0], *argv]
    weekly.main()


if __name__ == "__main__":
    main()
