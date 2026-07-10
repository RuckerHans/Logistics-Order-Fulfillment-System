import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Reservation } from './entities/reservation.entity';
import { Stock } from './entities/stock.entity';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let manager: {
    find: jest.Mock;
    save: jest.Mock;
    insert: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  const stockRow = (sku: string, availableQty: number, reservedQty = 0): Stock =>
    Object.assign(new Stock(), { sku, availableQty, reservedQty });

  beforeEach(async () => {
    manager = {
      find: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };

    const module = await Test.createTestingModule({
      providers: [InventoryService, { provide: DataSource, useValue: dataSource }],
    }).compile();

    service = module.get(InventoryService);
  });

  const input = {
    traceId: 'trace-1',
    orderId: 'order-1',
    items: [{ sku: 'SKU001', qty: 2 }],
  };

  it('reserves stock and decrements/increments the right columns when sufficient', async () => {
    manager.find.mockImplementation((entity) => {
      if (entity === Reservation) return Promise.resolve([]); // no existing reservation
      return Promise.resolve([stockRow('SKU001', 10)]); // Stock query
    });

    const result = await service.reserveStock(input);

    expect(result).toEqual({ trace_id: 'trace-1', order_id: 'order-1', status: 'RESERVED' });
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ sku: 'SKU001', availableQty: 8, reservedQty: 2 }),
    );
    expect(manager.insert).toHaveBeenCalledWith(
      Reservation,
      expect.objectContaining({ orderId: 'order-1', sku: 'SKU001', qty: 2, status: 'RESERVED' }),
    );
  });

  it('reports INSUFFICIENT_STOCK and does not mutate anything when stock is short', async () => {
    manager.find.mockImplementation((entity) => {
      if (entity === Reservation) return Promise.resolve([]);
      return Promise.resolve([stockRow('SKU001', 1)]); // only 1 available, 2 requested
    });

    const result = await service.reserveStock(input);

    expect(result).toEqual({
      trace_id: 'trace-1',
      order_id: 'order-1',
      status: 'INSUFFICIENT_STOCK',
      unavailable_items: [{ sku: 'SKU001', requested_qty: 2, available_qty: 1 }],
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('is all-or-nothing: a shortfall on SKU002 leaves SKU001 (which had enough) untouched too', async () => {
    const multiInput = {
      traceId: 'trace-1',
      orderId: 'order-1',
      items: [
        { sku: 'SKU001', qty: 2 }, // sufficient: 10 available
        { sku: 'SKU002', qty: 100 }, // insufficient: only 1 available
      ],
    };
    // Distinct object references per SKU so mutation of one can't be
    // mistaken for the other — asserted against directly below, not just
    // inferred from manager.save's call count.
    const sku001Row = stockRow('SKU001', 10);
    const sku002Row = stockRow('SKU002', 1);
    manager.find.mockImplementation((entity) => {
      if (entity === Reservation) return Promise.resolve([]);
      return Promise.resolve([sku001Row, sku002Row]);
    });

    const result = await service.reserveStock(multiInput);

    expect(result.status).toBe('INSUFFICIENT_STOCK');
    // Only the short SKU is reported — proves SKU001 was actually evaluated
    // as sufficient, not skipped/short-circuited before being checked.
    expect((result as any).unavailable_items).toEqual([
      { sku: 'SKU002', requested_qty: 100, available_qty: 1 },
    ]);

    // The harder proof: SKU001's own row was never touched, even though it
    // individually had enough stock and is checked first in the loop.
    expect(sku001Row.availableQty).toBe(10);
    expect(sku001Row.reservedQty).toBe(0);
    expect(sku002Row.availableQty).toBe(1);
    expect(sku002Row.reservedQty).toBe(0);

    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('treats a missing stock row as zero available (not a crash)', async () => {
    manager.find.mockImplementation((entity) => {
      if (entity === Reservation) return Promise.resolve([]);
      return Promise.resolve([]); // SKU not in stock table at all
    });

    const result = await service.reserveStock(input);

    expect(result.status).toBe('INSUFFICIENT_STOCK');
    expect((result as any).unavailable_items[0]).toEqual({
      sku: 'SKU001',
      requested_qty: 2,
      available_qty: 0,
    });
  });

  it('is idempotent: a redelivered message for an already-reserved order does not double-reserve', async () => {
    manager.find.mockImplementation((entity) => {
      if (entity === Reservation) {
        return Promise.resolve([Object.assign(new Reservation(), { orderId: 'order-1' })]);
      }
      return Promise.resolve([stockRow('SKU001', 10)]);
    });

    const result = await service.reserveStock(input);

    expect(result).toEqual({ trace_id: 'trace-1', order_id: 'order-1', status: 'RESERVED' });
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });
});
