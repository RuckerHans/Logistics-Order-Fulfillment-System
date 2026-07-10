import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONSUMER_GROUPS,
  ORDER_STATUS_CHANGED_TOPIC,
  OrderStatus,
  OrderStatusChangedEventSchema,
} from '@logistics/contracts';
import { Consumer, Kafka } from 'kafkajs';
import { InventoryService, RetryableError } from '../inventory/inventory.service';

const RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 300;

@Injectable()
export class InventoryKafkaConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryKafkaConsumer.name);
  private readonly consumer: Consumer;

  constructor(
    config: ConfigService,
    private readonly inventoryService: InventoryService,
  ) {
    const brokers = (config.get<string>('KAFKA_BROKERS') ?? '')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    this.consumer = new Kafka({ clientId: 'inventory-service', brokers }).consumer({
      // Group ID from the Section 5.2 registry (packages/contracts) — never
      // shared with another service; see the registry's own comment for why.
      groupId: CONSUMER_GROUPS.inventoryService,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: ORDER_STATUS_CHANGED_TOPIC, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        await this.handle(message.value?.toString() ?? '');
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async handle(raw: string): Promise<void> {
    let event;
    try {
      event = OrderStatusChangedEventSchema.parse(JSON.parse(raw));
    } catch (err) {
      // Poison message — log loudly and advance the offset; re-reading it
      // forever would wedge the whole partition behind one bad payload.
      this.logger.error(`Malformed order.status_changed event, skipping: ${raw.slice(0, 200)}`, err as Error);
      return;
    }

    // Only PAYMENT_CONFIRMED (commit) and CANCELLED (release) act — every
    // other status is consumed (offset advances) but is a no-op.
    const target =
      event.new_status === OrderStatus.PAYMENT_CONFIRMED
        ? ('COMMITTED' as const)
        : event.new_status === OrderStatus.CANCELLED
          ? ('RELEASED' as const)
          : null;

    if (!target) {
      return;
    }

    // Section 19.2: a commit/release racing its own still-in-flight reserve
    // is transient — retry briefly rather than failing the message. After
    // the retries, a still-missing reservation means it never existed (the
    // INSUFFICIENT_STOCK cancellation path) — a legitimate no-op.
    for (let attempt = 1; ; attempt++) {
      try {
        await this.inventoryService.settleReservation(event.order_id, target);
        return;
      } catch (err) {
        if (!(err instanceof RetryableError)) {
          throw err; // real failure — let kafkajs redeliver
        }
        if (attempt >= RETRY_ATTEMPTS) {
          this.logger.warn(
            `Order ${event.order_id}: no reservation after ${attempt} attempts — treating ${target} as no-op ` +
              `(expected when the order was cancelled for insufficient stock; trace_id=${event.trace_id})`,
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
      }
    }
  }
}
