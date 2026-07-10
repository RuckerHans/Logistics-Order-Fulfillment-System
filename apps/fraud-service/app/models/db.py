"""SQLAlchemy models — project-plan.md Section 13's fraud schema.

Dedupe note: Section 19.1 prescribes UNIQUE (order_id, new_status), but
Section 13's fraud.order_events has no new_status column — the two sections
are inconsistent. Since this service only ever persists PLACED events
(RELEVANT_STATUSES filter in consumer/handlers.py), UNIQUE (order_id) is the
semantically equivalent dedupe key here; flagged rather than silently adding
a column Section 13 doesn't define.
"""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Numeric, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class OrderEvent(Base):
    __tablename__ = "order_events"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_fraud_order_events_order_id"),
        {"schema": "fraud"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    customer_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    delivery_address: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    order_value: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    event_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class FlaggedOrder(Base):
    __tablename__ = "flagged_orders"
    __table_args__ = (
        # One flag per (order, rule): a redelivered PLACED event re-running
        # the engine must not insert the same flag twice (Section 19.1's
        # idempotency requirement, applied to this table's semantics).
        UniqueConstraint("order_id", "rule_name", name="uq_flagged_orders_order_rule"),
        {"schema": "fraud"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    order_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    rule_name: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
