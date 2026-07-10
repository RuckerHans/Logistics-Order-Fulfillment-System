import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Stock } from './stock.entity';

export type ReservationStatus = 'RESERVED' | 'COMMITTED' | 'RELEASED';

@Entity({ schema: 'inventory', name: 'reservations' })
@Check(`"qty" > 0`)
@Check(`"status" IN ('RESERVED','COMMITTED','RELEASED')`)
export class Reservation {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Index('idx_reservations_order_id')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Index('idx_reservations_sku')
  @Column({ type: 'varchar', length: 50 })
  sku: string;

  @ManyToOne(() => Stock)
  @JoinColumn({ name: 'sku' })
  stock: Stock;

  @Column({ type: 'integer' })
  qty: number;

  @Column({ type: 'varchar', length: 20, default: 'RESERVED' })
  status: ReservationStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
