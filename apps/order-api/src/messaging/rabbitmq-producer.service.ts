import { Inject, Injectable } from '@nestjs/common';
import { RABBITMQ_EXCHANGE } from '@logistics/contracts';
import type { ChannelWrapper } from 'amqp-connection-manager';
import { RABBITMQ_CHANNEL } from './rabbitmq.module';

@Injectable()
export class RabbitMQProducerService {
  constructor(@Inject(RABBITMQ_CHANNEL) private readonly channel: ChannelWrapper) {}

  async publish(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    await this.channel.publish(RABBITMQ_EXCHANGE, routingKey, payload, {
      persistent: true, // deliveryMode: 2 — survives a broker restart
    });
  }
}
