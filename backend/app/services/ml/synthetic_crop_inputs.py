"""TEMPORARY FAKE INPUTS ONLY. Outputs still come from the trained TempCNN.

These illustrative normalized values are NOT satellite measurements. Channel semantics,
scaling and dates must be replaced by the future time-series source and training contract.
"""

import random

# 16 observations x 3 channels. Do not interpret these as real environmental data.
SYNTHETIC_SEQUENCE = (
    (0.12, 0.40, 0.20),
    (0.14, 0.42, 0.24),
    (0.18, 0.45, 0.29),
    (0.25, 0.48, 0.35),
    (0.38, 0.52, 0.43),
    (0.54, 0.56, 0.52),
    (0.70, 0.60, 0.62),
    (0.82, 0.62, 0.70),
    (0.88, 0.60, 0.76),
    (0.85, 0.56, 0.79),
    (0.76, 0.50, 0.75),
    (0.62, 0.44, 0.67),
    (0.45, 0.39, 0.55),
    (0.30, 0.36, 0.43),
    (0.20, 0.38, 0.31),
    (0.14, 0.40, 0.23),
)
PERTURBATION_PROBABILITY = 0.15
MAX_PERTURBATION = 0.025


def synthetic_sequences(count: int, seed: int):
    """Reproducible minor input noise, never random crop labels or predictions."""
    rng = random.Random(seed)
    return [
        [
            [
                max(0.0, min(1.0, value + rng.uniform(-MAX_PERTURBATION, MAX_PERTURBATION)))
                if rng.random() < PERTURBATION_PROBABILITY
                else value
                for value in step
            ]
            for step in SYNTHETIC_SEQUENCE
        ]
        for _ in range(count)
    ]
