import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { OutboxEntry } from '../database/entities/outbox-entry.entity';
import { KafkaProducerService } from '../messaging/kafka-producer.service';
import { RabbitMQProducerService } from '../messaging/rabbitmq-producer.service';

@Injectable()
export class OutboxPollerService {
  private readonly logger = new Logger(OutboxPollerService.name);

  // @Interval fires every tick regardless of whether the previous run
  // finished — found live: a hung Kafka connection made one tick take ~20s,
  // ticks piled up concurrently, and each one independently re-queried and
  // re-published the same still-unpublished RabbitMQ row (47x duplicate
  // publishes from a single order). This guard makes overlapping ticks a
  // no-op instead of concurrent re-processing of the same rows.
  private isPolling = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly kafkaProducer: KafkaProducerService,
    private readonly rabbitProducer: RabbitMQProducerService,
  ) {}

  @Interval(1000)
  async pollAndPublish(): Promise<void> {
    if (this.isPolling) {
      return;
    }
    this.isPolling = true;

    try {
      const repo = this.dataSource.getRepository(OutboxEntry);
      const entries = await repo.find({
        where: { publishedAt: IsNull() },
        order: { createdAt: 'ASC' },
        take: 50,
      });

      for (const entry of entries) {
        try {
          if (entry.channel === 'kafka') {
            await this.kafkaProducer.publish(entry.routingKey, entry.payload);
          } else {
            await this.rabbitProducer.publish(entry.routingKey, entry.payload);
          }
          entry.publishedAt = new Date();
          await repo.save(entry);
        } catch (err) {
          // Leave unpublished — retried on the next poll. At-least-once
          // delivery by design (Section 17); consumers must be idempotent.
          this.logger.error(`Failed to publish outbox entry ${entry.id}`, err as Error);
        }
      }
    } finally {
      this.isPolling = false;
    }
  }
}
