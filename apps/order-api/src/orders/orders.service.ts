import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { NOTIFY, OrderStatus, RESERVE_STOCK } from '@logistics/contracts';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { OutboxEntry } from '../database/entities/outbox-entry.entity';
import {
  DeliveryReminderJobData,
  GenerateInvoiceJobData,
  PaymentTimeoutJobData,
} from '../jobs/job-payloads';
import {
  DELIVERY_REMINDER_QUEUE,
  GENERATE_INVOICE_QUEUE,
  PAYMENT_TIMEOUT_QUEUE,
} from '../jobs/queue-names';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { InvalidTransitionException } from './exceptions/invalid-transition.exception';
import { OrderStateMachine } from './order-state-machine';
import {
  buildNotifyPayload,
  buildReserveStockPayload,
  buildStatusChangedPayload,
} from './outbox-payloads';

const PAYMENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 min from PLACED (Section 5.5)

// No estimated-delivery field exists anywhere in the schema or DTO — Section
// 5.5 defines the reminder as "estimatedDelivery - 1hr" but never says where
// that timestamp comes from. Assuming a fixed 3-day delivery window from the
// moment SHIPPED fires, documented here since it's a real assumption, not a
// spec value.
const ASSUMED_DELIVERY_DAYS = 3;
const DELIVERY_REMINDER_DELAY_MS = ASSUMED_DELIVERY_DAYS * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateMachine: OrderStateMachine,
    @InjectQueue(PAYMENT_TIMEOUT_QUEUE) private readonly paymentTimeoutQueue: Queue<PaymentTimeoutJobData>,
    @InjectQueue(DELIVERY_REMINDER_QUEUE) private readonly deliveryReminderQueue: Queue<DeliveryReminderJobData>,
    @InjectQueue(GENERATE_INVOICE_QUEUE) private readonly generateInvoiceQueue: Queue<GenerateInvoiceJobData>,
  ) {}

  async placeOrder(dto: CreateOrderDto): Promise<Order> {
    const order = await this.dataSource.transaction(async (manager) => {
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

      const notifyPayload = buildNotifyPayload(order, OrderStatus.PLACED);
      if (notifyPayload) {
        await manager.insert(OutboxEntry, {
          channel: 'rabbitmq',
          routingKey: NOTIFY.routingKey,
          aggregateId: order.id,
          eventType: 'order.notify',
          payload: notifyPayload,
        } as Partial<OutboxEntry>);
      }

      return order;
    });

    // Enqueued after the transaction commits — a job for an order that
    // never made it into Postgres would be worse than one that's a few
    // milliseconds late; BullMQ is internal-only (Section 5.5), not part of
    // the cross-service outbox pattern, so a direct call here (not another
    // outbox row) matches its own scope.
    await this.paymentTimeoutQueue.add(
      PAYMENT_TIMEOUT_QUEUE,
      { traceId: order.traceId, orderId: order.id },
      { delay: PAYMENT_TIMEOUT_MS },
    );

    return order;
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
    const order = await this.dataSource.transaction(async (manager) => {
      // SELECT ... FOR UPDATE — two concurrent requests moving the same
      // order forward (e.g. a duplicate webhook retry) can no longer race;
      // the second waits for the first transaction to commit or roll back.
      //
      // Deliberately NOT combined with `relations: ['items']` here: Postgres
      // rejects locking a query that joins to a nullable side ("FOR UPDATE
      // cannot be applied to the nullable side of an outer join") — found by
      // actually running this against a real reply-queue message, not in
      // testing with a mocked repository. Lock the order row alone, then
      // load items with a separate, unlocked query.
      const order = await manager.findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException(`Order ${id} not found`);
      }

      order.items = await manager.find(OrderItem, { where: { orderId: id } });

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

      const notifyPayload = buildNotifyPayload(order, to);
      if (notifyPayload) {
        await manager.insert(OutboxEntry, {
          channel: 'rabbitmq',
          routingKey: NOTIFY.routingKey,
          aggregateId: order.id,
          eventType: 'order.notify',
          payload: notifyPayload,
        } as Partial<OutboxEntry>);
      }

      return order;
    });

    // Same reasoning as placeOrder(): enqueued after the transaction
    // commits, not inside it — BullMQ is internal-only (Section 5.5), so a
    // direct call here rather than another outbox row.
    if (to === OrderStatus.SHIPPED) {
      await this.deliveryReminderQueue.add(
        DELIVERY_REMINDER_QUEUE,
        { traceId: order.traceId, orderId: order.id, customerId: order.customerId },
        { delay: DELIVERY_REMINDER_DELAY_MS },
      );
    }

    if (to === OrderStatus.PAYMENT_CONFIRMED) {
      await this.generateInvoiceQueue.add(GENERATE_INVOICE_QUEUE, {
        traceId: order.traceId,
        orderId: order.id,
      });
    }

    return order;
  }
}
