import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { OrderStatus, RESERVE_STOCK } from '@logistics/contracts';
import { DataSource, Repository } from 'typeorm';
import { OutboxEntry } from '../database/entities/outbox-entry.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { InvalidTransitionException } from './exceptions/invalid-transition.exception';
import { OrderStateMachine } from './order-state-machine';
import { buildReserveStockPayload, buildStatusChangedPayload } from './outbox-payloads';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateMachine: OrderStateMachine,
  ) {}

  async placeOrder(dto: CreateOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const totalValue = dto.items
        .reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
        .toFixed(2);

      const order = manager.create(Order, {
        customerId: dto.customerId,
        deliveryAddress: dto.deliveryAddress,
        branchId: dto.branchId,
        totalValue,
        status: OrderStatus.PLACED,
        traceId: randomUUID(),
        items: dto.items.map((item) =>
          Object.assign(new OrderItem(), {
            sku: item.sku,
            qty: item.qty,
            unitPrice: item.unitPrice.toFixed(2),
          }),
        ),
      });

      await manager.save(order);

      // Both outbox rows land in the same transaction as the order insert —
      // no separate dual-write to Kafka/RabbitMQ that could get out of sync
      // with what's actually in the database (Section 17).
      await manager.insert(OutboxEntry, {
        channel: 'kafka',
        routingKey: 'order.status_changed',
        aggregateId: order.id,
        eventType: 'order.status_changed',
        payload: buildStatusChangedPayload(order, null, OrderStatus.PLACED),
      } as Partial<OutboxEntry>);

      await manager.insert(OutboxEntry, {
        channel: 'rabbitmq',
        routingKey: RESERVE_STOCK.routingKey,
        aggregateId: order.id,
        eventType: 'order.reserve_stock',
        payload: buildReserveStockPayload(order),
      } as Partial<OutboxEntry>);

      return order;
    });
  }

  findAll(): Promise<Order[]> {
    return this.ordersRepo.find({ relations: ['items'] });
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.ordersRepo.findOne({ where: { id }, relations: ['items'] });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async transition(id: string, to: OrderStatus): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      // SELECT ... FOR UPDATE — two concurrent requests moving the same
      // order forward (e.g. a duplicate webhook retry) can no longer race;
      // the second waits for the first transaction to commit or roll back.
      const order = await manager.findOne(Order, {
        where: { id },
        relations: ['items'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException(`Order ${id} not found`);
      }

      if (!this.stateMachine.canTransition(order.status, to)) {
        throw new InvalidTransitionException(order.status, to);
      }

      const previousStatus = order.status;
      order.status = to;
      await manager.save(order);

      await manager.insert(OutboxEntry, {
        channel: 'kafka',
        routingKey: 'order.status_changed',
        aggregateId: order.id,
        eventType: 'order.status_changed',
        payload: buildStatusChangedPayload(order, previousStatus, to),
      } as Partial<OutboxEntry>);

      return order;
    });
  }
}
