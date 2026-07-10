import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { getNextRetryTarget, RESERVE_STOCK } from '@logistics/contracts';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { InventoryService } from '../inventory/inventory.service';
import { RABBITMQ_CHANNEL } from './rabbitmq.module';
import { RabbitMQProducerService } from './rabbitmq-producer.service';

interface ReserveStockPayload {
  trace_id: string;
  order_id: string;
  items: { sku: string; qty: number }[];
}

@Injectable()
export class ReserveStockConsumer implements OnModuleInit {
  private readonly logger = new Logger(ReserveStockConsumer.name);

  constructor(
    @Inject(RABBITMQ_CHANNEL) private readonly channel: ChannelWrapper,
    private readonly inventoryService: InventoryService,
    private readonly producer: RabbitMQProducerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.channel.addSetup((channel: ConfirmChannel) =>
      channel.consume(RESERVE_STOCK.queue, (msg) => this.handle(channel, msg)),
    );
  }

  private async handle(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) {
      return;
    }

    let payload: ReserveStockPayload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch (err) {
      this.logger.error('Malformed reserve_stock payload, routing straight to DLQ', err as Error);
      channel.sendToQueue(RESERVE_STOCK.dlq, msg.content, { persistent: true });
      channel.ack(msg);
      return;
    }

    try {
      const result = await this.inventoryService.reserveStock({
        traceId: payload.trace_id,
        orderId: payload.order_id,
        items: payload.items,
      });
      await this.producer.publishStockReservationResult(result);
      channel.ack(msg);
    } catch (err) {
      this.logger.error(`Failed to process reserve_stock for order ${payload.order_id}`, err as Error);
      const target = getNextRetryTarget(msg.properties.headers, RESERVE_STOCK);
      channel.sendToQueue(target, msg.content, { ...msg.properties, persistent: true });
      // Ack the original — we've explicitly re-routed it ourselves rather
      // than relying on a passive nack-triggered DLX (the main queue has no
      // static DLX arg; see getNextRetryTarget's own comment for why).
      channel.ack(msg);
      if (target === RESERVE_STOCK.dlq) {
        this.logger.error(
          `Order ${payload.order_id}'s reserve_stock exhausted all retries — routed to DLQ`,
        );
      }
    }
  }
}
