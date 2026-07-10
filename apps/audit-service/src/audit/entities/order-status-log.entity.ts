import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

// Append-only by ROLE grant, not just convention: audit_app has INSERT +
// SELECT only (no UPDATE/DELETE) — enforced at the DB level via init.sql.
@Entity({ schema: 'audit', name: 'order_status_log' })
// Section 19.1: dedupe on (order_id, new_status).
@Unique('uq_audit_order_status', ['orderId', 'newStatus'])
export class OrderStatusLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Index('idx_audit_order_id')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'previous_status', type: 'varchar', length: 20, nullable: true })
  previousStatus: string | null;

  @Column({ name: 'new_status', type: 'varchar', length: 20 })
  newStatus: string;

  @Column({ name: 'delivery_address', type: 'text' })
  deliveryAddress: string;

  @Column({ name: 'order_value', type: 'numeric', precision: 10, scale: 2 })
  orderValue: string;

  // jsonb — same `any` reasoning as order_api.outbox's payload column:
  // TypeORM's QueryDeepPartialEntity can't usefully narrow `unknown`.
  @Column({ type: 'jsonb' })
  items: any;

  @Column({ name: 'branch_id', type: 'varchar', length: 20 })
  branchId: string;

  @Column({ name: 'event_timestamp', type: 'timestamptz' })
  eventTimestamp: Date;

  @CreateDateColumn({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;
}
