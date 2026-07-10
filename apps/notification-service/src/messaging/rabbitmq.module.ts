import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NOTIFY, RABBITMQ_EXCHANGE, RETRY_STAGES_MS } from '@logistics/contracts';
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
            await channel.assertQueue(NOTIFY.queue, { durable: true });
            await channel.bindQueue(NOTIFY.queue, RABBITMQ_EXCHANGE, NOTIFY.routingKey);

            // Retry stages: TTL-bound, dead-letter back into the main queue
            // once the TTL expires. Which stage a failed message goes to
            // (attempt/x-death count) is consumer logic, not topology.
            NOTIFY.retryQueues.forEach((queueName, i) => {
              channel.assertQueue(queueName, {
                durable: true,
                arguments: {
                  'x-message-ttl': RETRY_STAGES_MS[i],
                  'x-dead-letter-exchange': '',
                  'x-dead-letter-routing-key': NOTIFY.queue,
                },
              });
            });

            // Terminal DLQ — consumer explicitly routes here after
            // exhausting all retry stages.
            await channel.assertQueue(NOTIFY.dlq, { durable: true });
          },
        });
      },
    },
  ],
  exports: [RABBITMQ_CHANNEL],
})
export class RabbitMQModule {}
