import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Reservation } from './entities/reservation.entity';
import { Stock } from './entities/stock.entity';

export interface ReserveStockInput {
  traceId: string;
  orderId: string;
  items: { sku: string; qty: number }[];
}

export interface StockReservationResult {
  trace_id: string;
  order_id: string;
  status: 'RESERVED' | 'INSUFFICIENT_STOCK';
  unavailable_items?: { sku: string; requested_qty: number; available_qty: number }[];
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async reserveStock(input: ReserveStockInput): Promise<StockReservationResult> {
    return this.dataSource.transaction(async (manager) => {
      // Idempotency (Section 19.1): a redelivered reserve_stock message
      // (at-least-once outbox delivery) must not double-reserve. If this
      // order already has reservations, the first delivery already ran —
      // report the same outcome again rather than re-touching stock.
      const existing = await manager.find(Reservation, { where: { orderId: input.orderId } });
      if (existing.length > 0) {
        this.logger.warn(`Reservation for order ${input.orderId} already exists — replaying result`);
        return {
          trace_id: input.traceId,
          order_id: input.orderId,
          status: 'RESERVED',
        };
      }

      const skus = input.items.map((item) => item.sku);

      // SELECT ... FOR UPDATE on every stock row this order touches — two
      // orders concurrently reserving the same SKU must not both read
      // "sufficient" before either commits (the entire point of a
      // reservation system is to prevent exactly that oversell race).
      const stockRows = await manager.find(Stock, {
        where: { sku: In(skus) },
        lock: { mode: 'pessimistic_write' },
      });
      const stockBySku = new Map(stockRows.map((s) => [s.sku, s]));

      const unavailable: { sku: string; requested_qty: number; available_qty: number }[] = [];
      for (const item of input.items) {
        const stock = stockBySku.get(item.sku);
        const availableQty = stock?.availableQty ?? 0;
        if (availableQty < item.qty) {
          unavailable.push({ sku: item.sku, requested_qty: item.qty, available_qty: availableQty });
        }
      }

      if (unavailable.length > 0) {
        return {
          trace_id: input.traceId,
          order_id: input.orderId,
          status: 'INSUFFICIENT_STOCK',
          unavailable_items: unavailable,
        };
      }

      // All-or-nothing: only mutate stock once every item has been checked.
      for (const item of input.items) {
        const stock = stockBySku.get(item.sku)!;
        stock.availableQty -= item.qty;
        stock.reservedQty += item.qty;
        await manager.save(stock);

        await manager.insert(Reservation, {
          orderId: input.orderId,
          sku: item.sku,
          qty: item.qty,
          status: 'RESERVED',
        });
      }

      return {
        trace_id: input.traceId,
        order_id: input.orderId,
        status: 'RESERVED',
      };
    });
  }
}
