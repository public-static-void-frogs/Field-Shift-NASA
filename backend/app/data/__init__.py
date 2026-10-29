"""Read-only demo fixtures. Services return copies, never mutate the seed data."""

import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path


@lru_cache
def _load(name: str):
    return json.loads(Path(__file__).with_name(f"{name}.json").read_text())


def fixture(name: str):
    return deepcopy(_load(name))
