import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderStatusEvent } from './entities/order-status-event.entity';

export interface AnalyticsSummary {
  totalOrdersPlaced: number;
  totalOrderValue: string;
  countsByStatus: Record<string, number>;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(OrderStatusEvent) private readonly eventsRepo: Repository<OrderStatusEvent>,
  ) {}

  // Idempotent ingest (Section 19.1): ON CONFLICT (order_id, new_status)
  // DO NOTHING — a redelivered event inserts zero rows, never a duplicate.
  async ingest(event: {
    order_id: string;
    new_status: string;
    previous_status: string | null;
    order_value: number;
    timestamp: string;
    metadata: { branch_id: string };
  }): Promise<void> {
    const result = await this.eventsRepo
      .createQueryBuilder()
      .insert()
      .values({
        orderId: event.order_id,
        branchId: event.metadata.branch_id,
        previousStatus: event.previous_status,
        newStatus: event.new_status,
        orderValue: event.order_value.toFixed(2),
        eventTimestamp: new Date(event.timestamp),
      })
      .orIgnore() // ON CONFLICT DO NOTHING
      .execute();

    if (result.identifiers.length === 0 || result.identifiers[0] === undefined) {
      this.logger.warn(
        `Duplicate event for order ${event.order_id} -> ${event.new_status} ignored (idempotent ingest)`,
      );
    }
  }

  async summary(): Promise<AnalyticsSummary> {
    const rows: { new_status: string; count: string }[] = await this.eventsRepo
      .createQueryBuilder('e')
      .select('e.new_status', 'new_status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.new_status')
      .getRawMany();

    const placedValue: { total: string | null } | undefined = await this.eventsRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.order_value), 0)', 'total')
      .where("e.new_status = 'PLACED'")
      .getRawOne();

    const countsByStatus: Record<string, number> = {};
    for (const row of rows) {
      countsByStatus[row.new_status] = Number(row.count);
    }

    return {
      totalOrdersPlaced: countsByStatus['PLACED'] ?? 0,
      totalOrderValue: placedValue?.total ?? '0',
      countsByStatus,
    };
  }
}
