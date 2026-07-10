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

// Same 3-stage TTL retry + terminal DLQ pattern as RESERVE_STOCK/NOTIFY —
// this queue has a consumer with real failure modes too (a transient DB
// blip processing a reservation result), so it needs the same backoff
// rather than an immediate same-queue requeue loop.
export const STOCK_RESERVATION_RESULTS = {
  queue: STOCK_RESERVATION_RESULTS_QUEUE,
  retryQueues: retryQueueNames(STOCK_RESERVATION_RESULTS_QUEUE),
  dlq: `${STOCK_RESERVATION_RESULTS_QUEUE}.failed`,
} as const;

export interface RetryableQueueConfig {
  readonly retryQueues: readonly string[];
  readonly dlq: string;
}

interface XDeathEntry {
  queue?: string;
}

// The main queue itself carries no dead-letter-exchange argument — routing
// a failed message to a specific backoff stage is a decision, not passive
// nack-triggered DLX (a static DLX arg can only ever point at one fixed
// queue). Each retry-stage queue DOES have a TTL + DLX back to the main
// queue, so RabbitMQ automatically appends an x-death entry once that
// stage's TTL expires and the message flows back — this reads however many
// stages have already been passed through, purely from that header, and
// says which queue to explicitly publish into next.
export function getNextRetryTarget(
  headers: Record<string, unknown> | undefined,
  config: RetryableQueueConfig,
): string {
  const xDeath = (headers?.['x-death'] as XDeathEntry[] | undefined) ?? [];
  const retrySet = new Set(config.retryQueues);
  const passages = xDeath.filter((entry) => entry.queue && retrySet.has(entry.queue)).length;
  return config.retryQueues[passages] ?? config.dlq;
}
