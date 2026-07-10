import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONSUMER_GROUPS,
  ORDER_STATUS_CHANGED_TOPIC,
  OrderStatusChangedEventSchema,
} from '@logistics/contracts';
import { Consumer, Kafka } from 'kafkajs';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class AnalyticsKafkaConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsKafkaConsumer.name);
  private readonly consumer: Consumer;

  constructor(
    config: ConfigService,
    private readonly analyticsService: AnalyticsService,
  ) {
    const brokers = (config.get<string>('KAFKA_BROKERS') ?? '')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    this.consumer = new Kafka({ clientId: 'analytics-service', brokers }).consumer({
      // Group ID from the Section 5.2 registry (packages/contracts) — never
      // shared with another service; see the registry's own comment for why.
      groupId: CONSUMER_GROUPS.analyticsService,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: ORDER_STATUS_CHANGED_TOPIC, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const raw = message.value?.toString() ?? '';
        let event;
        try {
          event = OrderStatusChangedEventSchema.parse(JSON.parse(raw));
        } catch (err) {
          this.logger.error(`Malformed event, skipping: ${raw.slice(0, 200)}`, err as Error);
          return;
        }
        await this.analyticsService.ingest(event);
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }
}
