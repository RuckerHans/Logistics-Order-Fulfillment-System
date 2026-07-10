"""Pydantic mirror of order.status_changed — project-plan.md Section 5.1.

Kept in lockstep with packages/contracts' zod schema via the shared-fixture
contract test (Section 19.3): both sides validate the same canonical JSON
files in CI, so drift fails a test instead of surfacing in production.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class OrderStatus(str, Enum):
    PLACED = "PLACED"
    PAYMENT_CONFIRMED = "PAYMENT_CONFIRMED"
    PICKING = "PICKING"
    PACKED = "PACKED"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"


class OrderItem(BaseModel):
    sku: str
    qty: int = Field(gt=0)
    unit_price: float = Field(ge=0)


class OrderMetadata(BaseModel):
    branch_id: str


class OrderStatusChangedEvent(BaseModel):
    schema_version: int
    trace_id: str
    order_id: str
    customer_id: str
    previous_status: Optional[OrderStatus]
    new_status: OrderStatus
    timestamp: datetime
    delivery_address: str
    order_value: float = Field(ge=0)
    items: list[OrderItem]
    metadata: OrderMetadata
