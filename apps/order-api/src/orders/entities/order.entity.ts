import { OrderStatus } from '@logistics/contracts';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { OrderItem } from './order-item.entity';

const VALID_STATUSES = Object.values(OrderStatus);

@Entity({ schema: 'order_api', name: 'orders' })
@Check(`"status" IN (${VALID_STATUSES.map((s) => `'${s}'`).join(',')})`)
@Check(`"total_value" >= 0`)
export class Order {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Index('idx_orders_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Index('idx_orders_status')
  @Column({ type: 'varchar', length: 20, default: OrderStatus.PLACED })
  status: OrderStatus;

  @Column({ name: 'delivery_address', type: 'text' })
  deliveryAddress: string;

  @Column({ name: 'branch_id', type: 'varchar', length: 20 })
  branchId: string;

  @Column({ name: 'total_value', type: 'numeric', precision: 10, scale: 2 })
  totalValue: string;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
