"""Init fraud schema — order_events + flagged_orders per Section 13,
with idempotency unique constraints (see app/models/db.py's docstring for
the Section 13 vs 19.1 dedupe-key discrepancy and its resolution).

Revision ID: 0001
Revises:
Create Date: 2026-07-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "order_events",
        # BIGSERIAL per Section 13 (not IDENTITY): init.sql's sequence
        # default-privileges exist precisely for the serial's backing
        # sequence — fraud_app needs USAGE on it to INSERT.
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("order_id", UUID(as_uuid=False), nullable=False),
        sa.Column("customer_id", UUID(as_uuid=False), nullable=False),
        sa.Column("delivery_address", sa.Text(), nullable=False),
        sa.Column("order_value", sa.Numeric(10, 2), nullable=False),
        sa.Column("event_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "ingested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.UniqueConstraint("order_id", name="uq_fraud_order_events_order_id"),
        schema="fraud",
    )
    op.create_index("idx_fraud_events_customer", "order_events", ["customer_id"], schema="fraud")
    op.create_index("idx_fraud_events_address", "order_events", ["delivery_address"], schema="fraud")
    op.create_index("idx_fraud_events_timestamp", "order_events", ["event_timestamp"], schema="fraud")

    op.create_table(
        "flagged_orders",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("order_id", UUID(as_uuid=False), nullable=False),
        sa.Column("rule_name", sa.String(50), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.CheckConstraint("severity IN ('low','medium','high')", name="chk_flagged_orders_severity"),
        sa.UniqueConstraint("order_id", "rule_name", name="uq_flagged_orders_order_rule"),
        schema="fraud",
    )
    op.create_index("idx_flagged_orders_order_id", "flagged_orders", ["order_id"], schema="fraud")


def downgrade() -> None:
    op.drop_table("flagged_orders", schema="fraud")
    op.drop_table("order_events", schema="fraud")
