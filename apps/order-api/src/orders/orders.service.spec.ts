import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderStatus } from '@logistics/contracts';
import { DataSource, Repository } from 'typeorm';
import { OutboxEntry } from '../database/entities/outbox-entry.entity';
import {
  DELIVERY_REMINDER_QUEUE,
  GENERATE_INVOICE_QUEUE,
  PAYMENT_TIMEOUT_QUEUE,
} from '../jobs/queue-names';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { InvalidTransitionException } from './exceptions/invalid-transition.exception';
import { OrderStateMachine } from './order-state-machine';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: jest.Mocked<Repository<Order>>;
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
    insert: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let paymentTimeoutQueue: { add: jest.Mock };
  let deliveryReminderQueue: { add: jest.Mock };
  let generateInvoiceQueue: { add: jest.Mock };

  const makeOrder = (overrides: Partial<Order> = {}): Order =>
    Object.assign(new Order(), {
      id: 'order-1',
      customerId: 'cust-1',
      status: OrderStatus.PLACED,
      deliveryAddress: '123 Main St',
      branchId: 'branch_01',
      totalValue: '1450.00',
      traceId: 'trace-1',
      items: [Object.assign(new OrderItem(), { sku: 'SKU001', qty: 2, unitPrice: '725.00' })],
      ...overrides,
    });

  beforeEach(async () => {
    manager = {
      create: jest.fn((EntityClass, plain) => Object.assign(new EntityClass(), plain)),
      // Mirrors real Postgres/TypeORM behavior: save() RETURNING-populates
      // the gen_random_uuid() default back onto the entity — without this,
      // outbox payload building would see order.id as undefined here even
      // though it's always populated against a live connection.
      save: jest.fn((entity) => {
        if (!entity.id) entity.id = 'generated-order-id';
        return Promise.resolve(entity);
      }),
      insert: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      // transition() loads items via a separate, unlocked query (see the
      // comment in orders.service.ts on why it can't be combined with the
      // FOR UPDATE lock) — matches makeOrder()'s default items by default.
      find: jest.fn().mockResolvedValue([
        Object.assign(new OrderItem(), { sku: 'SKU001', qty: 2, unitPrice: '725.00' }),
      ]),
    };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    paymentTimeoutQueue = { add: jest.fn().mockResolvedValue(undefined) };
    deliveryReminderQueue = { add: jest.fn().mockResolvedValue(undefined) };
    generateInvoiceQueue = { add: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        OrderStateMachine,
        {
          provide: getRepositoryToken(Order),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        { provide: DataSource, useValue: dataSource },
        { provide: getQueueToken(PAYMENT_TIMEOUT_QUEUE), useValue: paymentTimeoutQueue },
        { provide: getQueueToken(DELIVERY_REMINDER_QUEUE), useValue: deliveryReminderQueue },
        { provide: getQueueToken(GENERATE_INVOICE_QUEUE), useValue: generateInvoiceQueue },
      ],
    }).compile();

    service = module.get(OrdersService);
    ordersRepo = module.get(getRepositoryToken(Order));
  });

  describe('placeOrder', () => {
    const dto = {
      customerId: 'cust-1',
      deliveryAddress: '123 Main St, Dagupan',
      branchId: 'branch_02',
      items: [
        { sku: 'SKU001', qty: 2, unitPrice: 725 },
        { sku: 'SKU002', qty: 1, unitPrice: 100 },
      ],
    };

    it('runs inside a single DB transaction', async () => {
      await service.placeOrder(dto);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('computes total_value and defaults status to PLACED', async () => {
      const order = await service.placeOrder(dto);
      expect(order.status).toBe(OrderStatus.PLACED);
      expect(order.totalValue).toBe('1550.00');
      expect(order.traceId).toEqual(expect.any(String));
      expect(manager.save).toHaveBeenCalledTimes(1);
    });

    it('inserts a kafka order.status_changed outbox row with a contract-valid payload', async () => {
      await service.placeOrder(dto);
      const kafkaInsert = manager.insert.mock.calls.find(
        ([, entry]) => entry.channel === 'kafka',
      );
      expect(kafkaInsert).toBeDefined();
      const [entityClass, entry] = kafkaInsert!;
      expect(entityClass).toBe(OutboxEntry);
      expect(entry.routingKey).toBe('order.status_changed');
      expect(entry.payload.new_status).toBe(OrderStatus.PLACED);
      expect(entry.payload.previous_status).toBeNull();
      expect(entry.payload.trace_id).toEqual(expect.any(String));
    });

    it('inserts a rabbitmq reserve_stock outbox row', async () => {
      await service.placeOrder(dto);
      const rabbitInsert = manager.insert.mock.calls.find(
        ([, entry]) => entry.channel === 'rabbitmq' && entry.routingKey === 'reserve_stock',
      );
      expect(rabbitInsert).toBeDefined();
      const [, entry] = rabbitInsert!;
      expect(entry.payload.items).toEqual([
        { sku: 'SKU001', qty: 2 },
        { sku: 'SKU002', qty: 1 },
      ]);
    });

    it('inserts a rabbitmq notify outbox row of type ORDER_PLACED', async () => {
      await service.placeOrder(dto);
      const notifyInsert = manager.insert.mock.calls.find(
        ([, entry]) => entry.channel === 'rabbitmq' && entry.routingKey === 'notify',
      );
      expect(notifyInsert).toBeDefined();
      const [, entry] = notifyInsert!;
      expect(entry.payload.type).toBe('ORDER_PLACED');
      expect(entry.payload.trace_id).toEqual(expect.any(String));
    });

    it('inserts exactly 3 outbox rows (kafka status_changed, rabbitmq reserve_stock, rabbitmq notify)', async () => {
      await service.placeOrder(dto);
      expect(manager.insert).toHaveBeenCalledTimes(3);
    });

    it('enqueues a payment-timeout job delayed 15 minutes, after the transaction commits', async () => {
      const order = await service.placeOrder(dto);

      expect(paymentTimeoutQueue.add).toHaveBeenCalledWith(
        PAYMENT_TIMEOUT_QUEUE,
        { traceId: order.traceId, orderId: order.id },
        { delay: 15 * 60 * 1000 },
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      ordersRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('transition', () => {
    it('locks the order row with SELECT ... FOR UPDATE inside a transaction', async () => {
      manager.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PLACED }));

      await service.transition('order-1', OrderStatus.PAYMENT_CONFIRMED);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.findOne).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          where: { id: 'order-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('applies a valid transition, persists it, and inserts the kafka + notify outbox rows', async () => {
      manager.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PLACED }));

      const result = await service.transition('order-1', OrderStatus.PAYMENT_CONFIRMED);

      expect(result.status).toBe(OrderStatus.PAYMENT_CONFIRMED);
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.PAYMENT_CONFIRMED }),
      );
      // PAYMENT_CONFIRMED maps to a notify type, so both rows are expected.
      expect(manager.insert).toHaveBeenCalledTimes(2);

      const kafkaEntry = manager.insert.mock.calls.find(([, e]) => e.channel === 'kafka')![1];
      expect(kafkaEntry.payload.previous_status).toBe(OrderStatus.PLACED);
      expect(kafkaEntry.payload.new_status).toBe(OrderStatus.PAYMENT_CONFIRMED);

      const notifyEntry = manager.insert.mock.calls.find(([, e]) => e.routingKey === 'notify')![1];
      expect(notifyEntry.payload.type).toBe('PAYMENT_CONFIRMED');
    });

    it('skips the notify insert for a transition with no customer-facing notification (PICKING)', async () => {
      manager.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PAYMENT_CONFIRMED }));

      await service.transition('order-1', OrderStatus.PICKING);

      // Only the kafka status_changed row — PICKING isn't in NOTIFY's type enum.
      expect(manager.insert).toHaveBeenCalledTimes(1);
      expect(manager.insert.mock.calls[0][1].channel).toBe('kafka');
    });

    it('enqueues generate-invoice-pdf (no delay) on transition to PAYMENT_CONFIRMED', async () => {
      manager.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PLACED }));

      const order = await service.transition('order-1', OrderStatus.PAYMENT_CONFIRMED);

      expect(generateInvoiceQueue.add).toHaveBeenCalledWith(GENERATE_INVOICE_QUEUE, {
        traceId: order.traceId,
        orderId: order.id,
      });
      expect(deliveryReminderQueue.add).not.toHaveBeenCalled();
    });

    it('enqueues delivery-reminder (delayed) on transition to SHIPPED', async () => {
      manager.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PACKED }));

      const order = await service.transition('order-1', OrderStatus.SHIPPED);

      expect(deliveryReminderQueue.add).toHaveBeenCalledWith(
        DELIVERY_REMINDER_QUEUE,
        { traceId: order.traceId, orderId: order.id, customerId: order.customerId },
        { delay: expect.any(Number) },
      );
      // Documented assumption (3-day delivery window, minus 1hr) — sanity
      // bound so a unit conversion typo doesn't silently slip through.
      const delay = deliveryReminderQueue.add.mock.calls[0][2].delay;
      expect(delay).toBeGreaterThan(23 * 60 * 60 * 1000); // more than 23h
      expect(delay).toBeLessThan(3 * 24 * 60 * 60 * 1000); // less than 3 full days
      expect(generateInvoiceQueue.add).not.toHaveBeenCalled();
    });

    it('does not enqueue either delivery-reminder or generate-invoice-pdf for an unrelated transition (PICKING)', async () => {
      manager.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PAYMENT_CONFIRMED }));

      await service.transition('order-1', OrderStatus.PICKING);

      expect(deliveryReminderQueue.add).not.toHaveBeenCalled();
      expect(generateInvoiceQueue.add).not.toHaveBeenCalled();
    });

    it('rejects an invalid transition and does not persist or publish anything', async () => {
      manager.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PLACED }));

      await expect(service.transition('order-1', OrderStatus.SHIPPED)).rejects.toThrow(
        InvalidTransitionException,
      );
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('rejects any transition out of a terminal state', async () => {
      manager.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DELIVERED }));

      await expect(service.transition('order-1', OrderStatus.CANCELLED)).rejects.toThrow(
        InvalidTransitionException,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the order does not exist', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.transition('missing', OrderStatus.PAYMENT_CONFIRMED)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
