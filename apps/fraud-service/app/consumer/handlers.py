"""Event handler — project-plan.md Section 6.

RELEVANT_STATUSES scoping: both rules only make sense against order
*placement* facts. Every other lifecycle transition is still consumed (the
offset advances normally — this service never falls behind or re-reads them)
but is an explicit, logged no-op BEFORE touching the rule engine or the
database. A future rule that genuinely needs a later transition gets added
to RELEVANT_STATUSES deliberately, not by omission.
"""

import logging

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.session import get_session
from app.models.db import FlaggedOrder, OrderEvent
from app.models.events import OrderStatus, OrderStatusChangedEvent
from app.rules.engine import engine

logger = logging.getLogger(__name__)

RELEVANT_STATUSES = {OrderStatus.PLACED}


async def handle_event(event: OrderStatusChangedEvent) -> None:
    if event.new_status not in RELEVANT_STATUSES:
        logger.info(
            "Skipping rule evaluation for order %s: new_status=%s is not in RELEVANT_STATUSES "
            "(consumed, offset advances, no-op; trace_id=%s)",
            event.order_id,
            event.new_status.value,
            event.trace_id,
        )
        return

    async with get_session() as session:
        # Idempotent ingest: ON CONFLICT (order_id) DO NOTHING — at-least-once
        # delivery means the same PLACED event can arrive twice (Section 19.1).
        insert_result = await session.execute(
            pg_insert(OrderEvent)
            .values(
                order_id=event.order_id,
                customer_id=event.customer_id,
                delivery_address=event.delivery_address,
                order_value=event.order_value,
                event_timestamp=event.timestamp,
            )
            .on_conflict_do_nothing(constraint="uq_fraud_order_events_order_id")
        )
        await session.commit()
        if insert_result.rowcount == 0:
            logger.warning(
                "Duplicate PLACED event for order %s ignored (idempotent ingest; trace_id=%s)",
                event.order_id,
                event.trace_id,
            )

    async with get_session() as session:
        flags = await engine.run(event, session)
        if flags:
            for flag in flags:
                # One flag per (order, rule) — a redelivered event re-running
                # the engine can't insert the same flag twice.
                await session.execute(
                    pg_insert(FlaggedOrder)
                    .values(
                        order_id=event.order_id,
                        rule_name=flag.rule_name,
                        reason=flag.reason,
                        severity=flag.severity,
                    )
                    .on_conflict_do_nothing(constraint="uq_flagged_orders_order_rule")
                )
            await session.commit()
