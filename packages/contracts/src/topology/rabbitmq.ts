// RabbitMQ topology registry — project-plan.md Section 5.3, 5.4.
// Every service's messaging module must reference these exact names rather
// than restating them — a typo'd queue/exchange name across services means
// AMQP silently drops the message (no error, no bounce), the same failure
// shape Section 5.2 calls out for Kafka consumer group IDs.

export const RABBITMQ_EXCHANGE = 'order.direct';

// 3-attempt exponential backoff (1s/5s/15s): each stage is its own queue,
// TTL-bound, dead-lettering back into the original queue once the TTL
// expires. Deciding *when* to route a failed message into which stage (by
// inspecting delivery/attempt count) is consumer business logic, not
// topology — these names just have to exist and be wired correctly.
export const RETRY_STAGES_MS = [1000, 5000, 15000] as const;

function retryQueueNames(baseQueue: string): string[] {
  return RETRY_STAGES_MS.map((ms) => `${baseQueue}.retry.${ms}ms`);
}

export const RESERVE_STOCK = {
  routingKey: 'reserve_stock',
  queue: 'inventory.reserve_stock',
  retryQueues: retryQueueNames('inventory.reserve_stock'),
  dlq: 'inventory.reserve_stock.failed',
} as const;

export const NOTIFY = {
  routingKey: 'notify',
  queue: 'notification.send',
  retryQueues: retryQueueNames('notification.send'),
  dlq: 'notification.send.failed',
} as const;

// Reply queue: Inventory Service publishes StockReservationResult here via
// the default exchange (routing key = queue name) — not bound to
// RABBITMQ_EXCHANGE, since it's a dedicated reply channel, not a fan-out.
export const STOCK_RESERVATION_RESULTS_QUEUE = 'order-api.stock-reservation-results';
