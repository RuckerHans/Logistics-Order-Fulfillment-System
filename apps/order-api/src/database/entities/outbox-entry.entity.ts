import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type OutboxChannel = 'kafka' | 'rabbitmq';

@Entity({ schema: 'order_api', name: 'outbox' })
@Check(`"channel" IN ('kafka','rabbitmq')`)
@Index('idx_outbox_unpublished', ['createdAt'], { where: '"published_at" IS NULL' })
export class OutboxEntry {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  channel: OutboxChannel;

  @Column({ name: 'routing_key', type: 'varchar', length: 100 })
  routingKey: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 50, default: 'order' })
  aggregateType: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType: string;

  // jsonb shape varies per event_type — not a single structural type, same
  // reason TypeORM's own QueryDeepPartialEntity can't usefully narrow it.
  @Column({ type: 'jsonb' })
  payload: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
}
