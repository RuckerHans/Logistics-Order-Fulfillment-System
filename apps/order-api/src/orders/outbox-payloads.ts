import { OrderStatus, OrderStatusChangedEventSchema } from '@logistics/contracts';
import { Order } from './entities/order.entity';

export function buildStatusChangedPayload(
  order: Order,
  previousStatus: OrderStatus | null,
  newStatus: OrderStatus,
): Record<string, unknown> {
  const payload = {
    schema_version: 1,
    trace_id: order.traceId,
    order_id: order.id,
    customer_id: order.customerId,
    previous_status: previousStatus,
    new_status: newStatus,
    timestamp: new Date().toISOString(),
    delivery_address: order.deliveryAddress,
    order_value: Number(order.totalValue),
    items: order.items.map((item) => ({
      sku: item.sku,
      qty: item.qty,
      unit_price: Number(item.unitPrice),
    })),
    metadata: { branch_id: order.branchId },
  };

  // Validated against the same contract Fraud Service parses with Pydantic —
  // catches a schema mismatch at write time, not downstream in a consumer.
  return OrderStatusChangedEventSchema.parse(payload);
}

export function buildReserveStockPayload(order: Order): Record<string, unknown> {
  return {
    trace_id: order.traceId,
    order_id: order.id,
    items: order.items.map((item) => ({ sku: item.sku, qty: item.qty })),
  };
}

// Only these five statuses map to a customer-facing notification (Section
// 5.4's NotifyMessage.type enum) — PICKING/PACKED are internal-only, no
// notify row for those.
const NOTIFY_TYPE_BY_STATUS: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.PLACED]: 'ORDER_PLACED',
  [OrderStatus.PAYMENT_CONFIRMED]: 'PAYMENT_CONFIRMED',
  [OrderStatus.SHIPPED]: 'SHIPPED',
  [OrderStatus.DELIVERED]: 'DELIVERED',
  [OrderStatus.CANCELLED]: 'CANCELLED',
};

export function buildNotifyPayload(
  order: Order,
  newStatus: OrderStatus,
): Record<string, unknown> | null {
  const type = NOTIFY_TYPE_BY_STATUS[newStatus];
  if (!type) {
    return null;
  }

  return {
    trace_id: order.traceId,
    order_id: order.id,
    customer_id: order.customerId,
    type,
    // No customer channel preference exists anywhere in the schema — EMAIL
    // is a fixed default, not a real routing decision.
    channel: 'EMAIL',
  };
}
