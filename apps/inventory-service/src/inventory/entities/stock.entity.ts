import { Check, Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'inventory', name: 'stock' })
@Check(`"available_qty" >= 0`)
@Check(`"reserved_qty" >= 0`)
export class Stock {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  sku: string;

  @Column({ name: 'available_qty', type: 'integer' })
  availableQty: number;

  @Column({ name: 'reserved_qty', type: 'integer', default: 0 })
  reservedQty: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
