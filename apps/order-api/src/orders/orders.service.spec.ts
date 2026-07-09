import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderStatus } from '@logistics/contracts';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { InvalidTransitionException } from './exceptions/invalid-transition.exception';
import { OrderStateMachine } from './order-state-machine';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let repo: jest.Mocked<Repository<Order>>;

  const makeOrder = (overrides: Partial<Order> = {}): Order =>
    Object.assign(new Order(), {
      id: 'order-1',
      customerId: 'cust-1',
      status: OrderStatus.PLACED,
      deliveryAddress: '123 Main St',
      branchId: 'branch_01',
      totalValue: '100.00',
      items: [],
      ...overrides,
    });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        OrderStateMachine,
        {
          provide: getRepositoryToken(Order),
          useValue: {
            create: jest.fn((input) => Object.assign(new Order(), input)),
            save: jest.fn((order) => Promise.resolve(order)),
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
    repo = module.get(getRepositoryToken(Order));
  });

  describe('create', () => {
    it('computes total_value from items and defaults status to PLACED', async () => {
      const order = await service.create({
        customerId: 'cust-1',
        deliveryAddress: '123 Main St',
        branchId: 'branch_01',
        items: [
          { sku: 'SKU001', qty: 2, unitPrice: 725 },
          { sku: 'SKU002', qty: 1, unitPrice: 100 },
        ],
      });

      expect(order.status).toBe(OrderStatus.PLACED);
      expect(order.totalValue).toBe('1550.00');
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the order does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('transition', () => {
    it('applies a valid transition and persists it', async () => {
      repo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PLACED }));

      const result = await service.transition('order-1', OrderStatus.PAYMENT_CONFIRMED);

      expect(result.status).toBe(OrderStatus.PAYMENT_CONFIRMED);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.PAYMENT_CONFIRMED }),
      );
    });

    it('rejects an invalid transition and does not persist anything', async () => {
      repo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.PLACED }));

      await expect(service.transition('order-1', OrderStatus.SHIPPED)).rejects.toThrow(
        InvalidTransitionException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects any transition out of a terminal state', async () => {
      repo.findOne.mockResolvedValue(makeOrder({ status: OrderStatus.DELIVERED }));

      await expect(service.transition('order-1', OrderStatus.CANCELLED)).rejects.toThrow(
        InvalidTransitionException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
