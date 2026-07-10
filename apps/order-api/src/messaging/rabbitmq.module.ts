import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RABBITMQ_EXCHANGE, STOCK_RESERVATION_RESULTS_QUEUE } from '@logistics/contracts';
import * as amqp from 'amqp-connection-manager';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';

export const RABBITMQ_CHANNEL = 'RABBITMQ_CHANNEL';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: RABBITMQ_CHANNEL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ChannelWrapper => {
        const connection = amqp.connect([config.get<string>('RABBITMQ_URL')!]);
        return connection.createChannel({
          json: true,
          setup: async (channel: ConfirmChannel) => {
            await channel.assertExchange(RABBITMQ_EXCHANGE, 'direct', { durable: true });
            // Order API owns/consumes the reply queue, so it's the one that
            // asserts it — Inventory Service just publishes into it by name.
            await channel.assertQueue(STOCK_RESERVATION_RESULTS_QUEUE, { durable: true });
          },
        });
      },
    },
  ],
  exports: [RABBITMQ_CHANNEL],
})
export class RabbitMQModule {}
