import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  RABBITMQ_EXCHANGE,
  RESERVE_STOCK,
  RETRY_STAGES_MS,
  STOCK_RESERVATION_RESULTS,
} from '@logistics/contracts';
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

            // Main queue — this service owns/consumes it, so it asserts it.
            await channel.assertQueue(RESERVE_STOCK.queue, { durable: true });
            await channel.bindQueue(
              RESERVE_STOCK.queue,
              RABBITMQ_EXCHANGE,
              RESERVE_STOCK.routingKey,
            );

            // Retry stages: each is TTL-bound and dead-letters back into the
            // main queue via the default exchange once its TTL expires.
            // Deciding *which* stage a failed message goes to (by inspecting
            // attempt/x-death count) is consumer logic, not topology.
            RESERVE_STOCK.retryQueues.forEach((queueName, i) => {
              channel.assertQueue(queueName, {
                durable: true,
                arguments: {
                  'x-message-ttl': RETRY_STAGES_MS[i],
                  'x-dead-letter-exchange': '',
                  'x-dead-letter-routing-key': RESERVE_STOCK.queue,
                },
              });
            });

            // Terminal DLQ — consumer explicitly routes here after
            // exhausting all retry stages.
            await channel.assertQueue(RESERVE_STOCK.dlq, { durable: true });

            // Asserted defensively here too (not just by Order API) so
            // publishing into it doesn't depend on Order API having started
            // first — assertQueue is idempotent.
            await channel.assertQueue(STOCK_RESERVATION_RESULTS.queue, { durable: true });
            STOCK_RESERVATION_RESULTS.retryQueues.forEach((queueName, i) => {
              channel.assertQueue(queueName, {
                durable: true,
                arguments: {
                  'x-message-ttl': RETRY_STAGES_MS[i],
                  'x-dead-letter-exchange': '',
                  'x-dead-letter-routing-key': STOCK_RESERVATION_RESULTS.queue,
                },
              });
            });
            await channel.assertQueue(STOCK_RESERVATION_RESULTS.dlq, { durable: true });
          },
        });
      },
    },
  ],
  exports: [RABBITMQ_CHANNEL],
})
export class RabbitMQModule {}
