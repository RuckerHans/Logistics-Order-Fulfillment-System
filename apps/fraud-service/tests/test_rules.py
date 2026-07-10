"""Rule unit tests — DB queries mocked at the session level; what's under
test is each rule's threshold/decision logic, not SQLAlchemy."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.events import OrderItem, OrderMetadata, OrderStatus, OrderStatusChangedEvent
from app.rules.value_anomaly_rule import ValueAnomalyRule
from app.rules.velocity_rule import VelocityRule


def make_event(order_value: float = 100.0) -> OrderStatusChangedEvent:
    return OrderStatusChangedEvent(
        schema_version=1,
        trace_id="trc_test",
        order_id="6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
        customer_id="6f9619ff-8b86-4d01-b42d-00cf4fc964fe",
        previous_status=None,
        new_status=OrderStatus.PLACED,
        timestamp=datetime.now(timezone.utc),
        delivery_address="123 Test St",
        order_value=order_value,
        items=[OrderItem(sku="SKU001", qty=1, unit_price=order_value)],
        metadata=OrderMetadata(branch_id="branch_01"),
    )


def session_returning_scalar(value):
    result = MagicMock()
    result.scalar_one.return_value = value
    session = MagicMock()
    session.execute = AsyncMock(return_value=result)
    return session


class TestVelocityRule:
    @pytest.mark.asyncio
    async def test_flags_at_threshold(self):
        session = session_returning_scalar(3)  # 3 orders in window (incl. this one)
        result = await VelocityRule().evaluate(make_event(), session)
        assert result is not None
        assert result.rule_name == "velocity"
        assert result.severity == "medium"

    @pytest.mark.asyncio
    async def test_no_flag_below_threshold(self):
        session = session_returning_scalar(2)
        assert await VelocityRule().evaluate(make_event(), session) is None


class TestValueAnomalyRule:
    @pytest.mark.asyncio
    async def test_flags_above_3x_average(self):
        session = session_returning_scalar(100.0)  # historical avg
        result = await ValueAnomalyRule().evaluate(make_event(order_value=301.0), session)
        assert result is not None
        assert result.rule_name == "value_anomaly"
        assert result.severity == "high"

    @pytest.mark.asyncio
    async def test_no_flag_at_exactly_3x(self):
        session = session_returning_scalar(100.0)
        assert await ValueAnomalyRule().evaluate(make_event(order_value=300.0), session) is None

    @pytest.mark.asyncio
    async def test_no_flag_without_history(self):
        session = session_returning_scalar(None)  # first order ever for this customer
        assert await ValueAnomalyRule().evaluate(make_event(order_value=10000.0), session) is None
