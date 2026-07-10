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
