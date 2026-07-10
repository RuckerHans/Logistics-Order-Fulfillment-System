import { Check, Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

export type NotificationChannel = 'EMAIL' | 'SMS';
export type NotificationStatus = 'SENT' | 'FAILED';

@Entity({ schema: 'notification', name: 'notification_log' })
@Check(`"channel" IN ('EMAIL','SMS')`)
@Check(`"status" IN ('SENT','FAILED')`)
export class NotificationLog {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Index('idx_notification_log_order_id')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ type: 'varchar', length: 30 })
  type: string;

  @Column({ type: 'varchar', length: 10 })
  channel: NotificationChannel;

  @Column({ type: 'varchar', length: 20, default: 'SENT' })
  status: NotificationStatus;

  @CreateDateColumn({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;
}
