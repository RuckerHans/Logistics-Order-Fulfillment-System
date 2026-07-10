import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderStatusLog } from './entities/order-status-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(OrderStatusLog) private readonly logRepo: Repository<OrderStatusLog>,
  ) {}

  // Idempotent append (Section 19.1): ON CONFLICT (order_id, new_status)
  // DO NOTHING — a redelivered event appends zero rows, never a duplicate.
  async record(event: {
    order_id: string;
    customer_id: string;
    previous_status: string | null;
    new_status: string;
    delivery_address: string;
    order_value: number;
    items: any; // jsonb passthrough — stored verbatim, never interpreted here
    timestamp: string;
    metadata: { branch_id: string };
  }): Promise<void> {
    const result = await this.logRepo
      .createQueryBuilder()
      .insert()
      .values({
        orderId: event.order_id,
        customerId: event.customer_id,
        previousStatus: event.previous_status,
        newStatus: event.new_status,
        deliveryAddress: event.delivery_address,
        orderValue: event.order_value.toFixed(2),
        items: event.items,
        branchId: event.metadata.branch_id,
        eventTimestamp: new Date(event.timestamp),
      })
      .orIgnore() // ON CONFLICT DO NOTHING
      .execute();

    if (result.identifiers.length === 0 || result.identifiers[0] === undefined) {
      this.logger.warn(
        `Duplicate event for order ${event.order_id} -> ${event.new_status} ignored (idempotent append)`,
      );
    }
  }
}
