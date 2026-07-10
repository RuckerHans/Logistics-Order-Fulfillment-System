import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONSUMER_GROUPS,
  ORDER_STATUS_CHANGED_TOPIC,
  OrderStatusChangedEventSchema,
} from '@logistics/contracts';
import { Consumer, Kafka } from 'kafkajs';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuditKafkaConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditKafkaConsumer.name);
  private readonly consumer: Consumer;

  constructor(
    config: ConfigService,
    private readonly auditService: AuditService,
  ) {
    const brokers = (config.get<string>('KAFKA_BROKERS') ?? '')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    this.consumer = new Kafka({ clientId: 'audit-service', brokers }).consumer({
      // Group ID from the Section 5.2 registry (packages/contracts) — never
      // shared with another service; see the registry's own comment for why.
      groupId: CONSUMER_GROUPS.auditService,
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
        await this.auditService.record(event);
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }
}
