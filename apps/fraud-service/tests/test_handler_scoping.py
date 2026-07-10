"""RELEVANT_STATUSES scoping — Section 6: only PLACED reaches the rule
engine or the database; every other status is a logged no-op that returns
before either is touched."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.consumer.handlers import RELEVANT_STATUSES, handle_event
from app.models.events import OrderItem, OrderMetadata, OrderStatus, OrderStatusChangedEvent


def make_event(new_status: OrderStatus) -> OrderStatusChangedEvent:
    return OrderStatusChangedEvent(
        schema_version=1,
        trace_id="trc_test",
        order_id="6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
        customer_id="6f9619ff-8b86-4d01-b42d-00cf4fc964fe",
        previous_status=None,
        new_status=new_status,
        timestamp=datetime.now(timezone.utc),
        delivery_address="123 Test St",
        order_value=100.0,
        items=[OrderItem(sku="SKU001", qty=1, unit_price=100.0)],
        metadata=OrderMetadata(branch_id="branch_01"),
    )


def test_relevant_statuses_is_exactly_placed():
    assert RELEVANT_STATUSES == {OrderStatus.PLACED}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status",
    [s for s in OrderStatus if s is not OrderStatus.PLACED],
)
async def test_non_placed_statuses_never_touch_db_or_rules(status: OrderStatus):
    with (
        patch("app.consumer.handlers.get_session") as mock_session,
        patch("app.consumer.handlers.engine") as mock_engine,
    ):
        mock_engine.run = AsyncMock()

        await handle_event(make_event(status))

        mock_session.assert_not_called()
        mock_engine.run.assert_not_called()
