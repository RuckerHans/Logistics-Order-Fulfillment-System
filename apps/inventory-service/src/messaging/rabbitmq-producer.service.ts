import { Inject, Injectable } from '@nestjs/common';
import { STOCK_RESERVATION_RESULTS_QUEUE } from '@logistics/contracts';
import type { ChannelWrapper } from 'amqp-connection-manager';
import { RABBITMQ_CHANNEL } from './rabbitmq.module';

@Injectable()
export class RabbitMQProducerService {
  constructor(@Inject(RABBITMQ_CHANNEL) private readonly channel: ChannelWrapper) {}

  // Publishes directly into the reply queue via the default exchange
  // (routing key = queue name) — not through RABBITMQ_EXCHANGE, since this
  // is a dedicated reply channel back to Order API, not a fan-out topic.
  async publishStockReservationResult(payload: Record<string, unknown>): Promise<void> {
    await this.channel.sendToQueue(STOCK_RESERVATION_RESULTS_QUEUE, payload, {
      persistent: true,
    });
  }
}
