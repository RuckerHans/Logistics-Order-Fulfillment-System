"""Value anomaly rule — order value > 3x the customer's historical average
(project-plan.md Section 6, high severity)."""

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db import OrderEvent
from app.models.events import OrderStatusChangedEvent
from app.rules.base import RuleResult

MULTIPLIER = 3


class ValueAnomalyRule:
    async def evaluate(
        self, event: OrderStatusChangedEvent, session: AsyncSession
    ) -> Optional[RuleResult]:
        # Historical average excludes the order being evaluated (it was just
        # persisted) — otherwise a customer's first order could never flag,
        # and every average would be dragged toward the current value.
        result = await session.execute(
            select(func.avg(OrderEvent.order_value))
            .where(OrderEvent.customer_id == event.customer_id)
            .where(OrderEvent.order_id != event.order_id)
        )
        avg = result.scalar_one()

        if avg is None:
            return None  # no history — nothing to compare against

        if event.order_value > MULTIPLIER * float(avg):
            return RuleResult(
                rule_name="value_anomaly",
                reason=(
                    f"order value {event.order_value:.2f} exceeds {MULTIPLIER}x "
                    f"customer average {float(avg):.2f}"
                ),
                severity="high",
            )
        return None
