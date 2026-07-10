import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer;

  constructor(config: ConfigService) {
    const brokers = (config.get<string>('KAFKA_BROKERS') ?? '')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    this.producer = new Kafka({ clientId: 'order-api', brokers }).producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
    await this.producer.send({
      topic,
      acks: -1, // acks=all — CLAUDE.md non-negotiable convention
      messages: [{ key: String(payload.order_id ?? ''), value: JSON.stringify(payload) }],
    });
  }
}
