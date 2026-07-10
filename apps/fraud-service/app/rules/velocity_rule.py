"""Velocity rule — 3+ orders to the same delivery address within 10 minutes
(project-plan.md Section 6, medium severity)."""

from datetime import timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db import OrderEvent
from app.models.events import OrderStatusChangedEvent
from app.rules.base import RuleResult

WINDOW = timedelta(minutes=10)
THRESHOLD = 3


class VelocityRule:
    async def evaluate(
        self, event: OrderStatusChangedEvent, session: AsyncSession
    ) -> Optional[RuleResult]:
        # Counts prior ingested placements at this address inside the window,
        # plus the event being evaluated (persisted just before rules run).
        window_start = event.timestamp - WINDOW
        result = await session.execute(
            select(func.count())
            .select_from(OrderEvent)
            .where(OrderEvent.delivery_address == event.delivery_address)
            .where(OrderEvent.event_timestamp >= window_start)
            .where(OrderEvent.event_timestamp <= event.timestamp)
        )
        count = result.scalar_one()

        if count >= THRESHOLD:
            return RuleResult(
                rule_name="velocity",
                reason=(
                    f"{count} orders to address '{event.delivery_address}' "
                    f"within {WINDOW.total_seconds() / 60:.0f} minutes"
                ),
                severity="medium",
            )
        return None
