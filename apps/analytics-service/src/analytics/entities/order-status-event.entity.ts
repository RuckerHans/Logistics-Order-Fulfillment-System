import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ schema: 'analytics', name: 'order_status_events' })
// Section 19.1: dedupe on (order_id, new_status) — safe because the state
// machine only moves forward, so the pair is unique per legitimate event.
@Unique('uq_analytics_order_status', ['orderId', 'newStatus'])
export class OrderStatusEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Index('idx_analytics_events_branch')
  @Column({ name: 'branch_id', type: 'varchar', length: 20 })
  branchId: string;

  @Column({ name: 'previous_status', type: 'varchar', length: 20, nullable: true })
  previousStatus: string | null;

  @Index('idx_analytics_events_status')
  @Column({ name: 'new_status', type: 'varchar', length: 20 })
  newStatus: string;

  @Column({ name: 'order_value', type: 'numeric', precision: 10, scale: 2 })
  orderValue: string;

  @Index('idx_analytics_events_timestamp')
  @Column({ name: 'event_timestamp', type: 'timestamptz' })
  eventTimestamp: Date;

  @CreateDateColumn({ name: 'ingested_at', type: 'timestamptz' })
  ingestedAt: Date;
}
