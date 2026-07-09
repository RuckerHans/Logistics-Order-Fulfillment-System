import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ schema: 'order_api', name: 'customers' })
export class Customer {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
