"""Contract drift test — Section 19.3.

Validates the SAME canonical JSON fixtures packages/contracts' zod schema
validates in its own test suite. If either side accepts a payload the other
rejects, this drift surfaces as a failing test, not a silent production
mismatch between kafkajs producers and this Pydantic consumer.
"""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models.events import OrderStatusChangedEvent

FIXTURES_DIR = Path(__file__).parent.parent.parent.parent / "packages" / "contracts" / "fixtures"


def load_fixture(name: str) -> dict:
    with open(FIXTURES_DIR / name) as f:
        return json.load(f)


def test_accepts_canonical_valid_payload():
    payload = load_fixture("order-status-changed.valid.json")
    OrderStatusChangedEvent(**payload)  # should not raise


def test_rejects_canonical_invalid_payload():
    payload = load_fixture("order-status-changed.invalid.json")
    with pytest.raises(ValidationError):
        OrderStatusChangedEvent(**payload)
