import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderStatus } from '@logistics/contracts';
import { DataSource, Repository } from 'typeorm';
import { OutboxEntry } from '../database/entities/outbox-entry.entity';
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
  };
  let dataSource: { transaction: jest.Mock };

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
    };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };

    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        OrderStateMachine,
        {
          provide: getRepositoryToken(Order),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        { provide: DataSource, useValue: dataSource },
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
        ([, entry]) => entry.channel === 'rabbitmq',
      );
      expect(rabbitInsert).toBeDefined();
      const [, entry] = rabbitInsert!;
      expect(entry.routingKey).toBe('reserve_stock');
      expect(entry.payload.items).toEqual([
        { sku: 'SKU001', qty: 2 },
        { sku: 'SKU002', qty: 1 },
      ]);
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

    it('applies a valid transition, persists it, and inserts one outbox row', async () => {
      manager.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PLACED }));

      const result = await service.transition('order-1', OrderStatus.PAYMENT_CONFIRMED);

      expect(result.status).toBe(OrderStatus.PAYMENT_CONFIRMED);
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.PAYMENT_CONFIRMED }),
      );
      expect(manager.insert).toHaveBeenCalledTimes(1);
      const [, entry] = manager.insert.mock.calls[0];
      expect(entry.payload.previous_status).toBe(OrderStatus.PLACED);
      expect(entry.payload.new_status).toBe(OrderStatus.PAYMENT_CONFIRMED);
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
