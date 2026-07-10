import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderStatusEvent } from './entities/order-status-event.entity';

export interface AnalyticsSummary {
  totalOrdersPlaced: number;
  totalOrderValue: string;
  countsByStatus: Record<string, number>;
}

export interface OrdersPerHourBucket {
  hour: string;
  count: number;
}

export interface TimeInStatusEntry {
  status: string;
  avgSeconds: number;
  sampleSize: number;
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

  // New backend surface (Phase 5) — Section 3 only specified this service as
  // a Kafka consumer with no REST API; this is a real endpoint, not UI glue,
  // so it gets the same scrutiny: bounded window (default/max 168h = 7
  // days), parameterized query (no string-interpolated SQL), typed output.
  async ordersPerHour(hours = 24): Promise<OrdersPerHourBucket[]> {
    const boundedHours = Math.min(Math.max(1, hours), 168);
    const rows: { hour: string; count: string }[] = await this.eventsRepo.query(
      `SELECT date_trunc('hour', event_timestamp) AS hour, COUNT(*)::int AS count
       FROM analytics.order_status_events
       WHERE new_status = 'PLACED' AND event_timestamp >= now() - ($1 || ' hours')::interval
       GROUP BY hour
       ORDER BY hour ASC`,
      [boundedHours],
    );
    return rows.map((r) => ({ hour: r.hour, count: Number(r.count) }));
  }

  // Average seconds an order spends in each status before its NEXT recorded
  // transition — computed via LEAD() per order_id, not by trusting any
  // application-side clock. Statuses with no later event yet (e.g. the
  // newest DELIVERED order) are correctly excluded, not counted as zero.
  async averageTimeInStatus(): Promise<TimeInStatusEntry[]> {
    const rows: { status: string; avg_seconds: string; sample_size: string }[] =
      await this.eventsRepo.query(`
        WITH ordered AS (
          SELECT
            new_status,
            event_timestamp,
            LEAD(event_timestamp) OVER (PARTITION BY order_id ORDER BY event_timestamp) AS next_timestamp
          FROM analytics.order_status_events
        )
        SELECT
          new_status AS status,
          AVG(EXTRACT(EPOCH FROM (next_timestamp - event_timestamp))) AS avg_seconds,
          COUNT(*)::int AS sample_size
        FROM ordered
        WHERE next_timestamp IS NOT NULL
        GROUP BY new_status
        ORDER BY new_status
      `);
    return rows.map((r) => ({
      status: r.status,
      avgSeconds: Number(r.avg_seconds),
      sampleSize: Number(r.sample_size),
    }));
  }
}
