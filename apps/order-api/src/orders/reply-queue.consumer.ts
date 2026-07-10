import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { getNextRetryTarget, OrderStatus, STOCK_RESERVATION_RESULTS } from '@logistics/contracts';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { RABBITMQ_CHANNEL } from '../messaging/rabbitmq.module';
import { InvalidTransitionException } from './exceptions/invalid-transition.exception';
import { OrdersService } from './orders.service';

interface StockReservationResultPayload {
  trace_id: string;
  order_id: string;
  status: 'RESERVED' | 'INSUFFICIENT_STOCK';
  unavailable_items?: { sku: string; requested_qty: number; available_qty: number }[];
}

@Injectable()
export class ReplyQueueConsumer implements OnModuleInit {
  private readonly logger = new Logger(ReplyQueueConsumer.name);

  constructor(
    @Inject(RABBITMQ_CHANNEL) private readonly channel: ChannelWrapper,
    private readonly ordersService: OrdersService,
  ) {}

  async onModuleInit(): Promise<void> {
    // addSetup (not a one-off consume call): re-registers the consumer on
    // every reconnect too, not just the first connection.
    //
    // assertQueue here too, even though RabbitMQModule's own setup already
    // does it: amqp-connection-manager runs every registered setup function
    // concurrently (Promise.all), not in registration order, so this
    // addSetup callback can't rely on that other setup having finished
    // first. Against a fresh vhost with no pre-existing queue, consume()
    // would otherwise race assertQueue() and fail with 404 NOT_FOUND —
    // assertQueue is idempotent, so asserting again here is free.
    await this.channel.addSetup((channel: ConfirmChannel) =>
      channel
        .assertQueue(STOCK_RESERVATION_RESULTS.queue, { durable: true })
        .then(() => channel.consume(STOCK_RESERVATION_RESULTS.queue, (msg) => this.handle(channel, msg))),
    );
  }

  private async handle(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) {
      return;
    }

    let payload: StockReservationResultPayload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch (err) {
      this.logger.error('Malformed stock reservation result, dropping', err as Error);
      channel.ack(msg); // nothing we can ever do with this — don't requeue forever
      return;
    }

    try {
      if (payload.status === 'INSUFFICIENT_STOCK') {
        await this.ordersService.transition(payload.order_id, OrderStatus.CANCELLED);
        this.logger.log(
          `Order ${payload.order_id} cancelled — insufficient stock (trace_id=${payload.trace_id})`,
        );
      } else {
        this.logger.log(
          `Order ${payload.order_id} stock reserved, awaiting payment (trace_id=${payload.trace_id})`,
        );
      }
      channel.ack(msg);
    } catch (err) {
      if (err instanceof InvalidTransitionException) {
        // Redelivery of a result we've already acted on (outbox/at-least-
        // once delivery can redeliver the same result more than once) — the
        // order is no longer in a state this transition applies to. Safe
        // no-op, not a real failure: ack, don't retry forever.
        this.logger.warn(
          `Ignoring stale/duplicate reservation result for order ${payload.order_id}: ${(err as Error).message}`,
        );
        channel.ack(msg);
        return;
      }
      if (err instanceof NotFoundException) {
        // No retry policy is wired for this queue (unlike reserve_stock and
        // notify) — an order_id that will never exist can't be fixed by
        // requeueing it, so log loudly and drop rather than loop forever.
        this.logger.error(`Order ${payload.order_id} not found, dropping reservation result`, err as Error);
        channel.ack(msg);
        return;
      }
      this.logger.error(
        `Failed to process reservation result for order ${payload.order_id}`,
        err as Error,
      );
      // Same explicit-routing pattern as reserve_stock/notify — publish to
      // the next backoff stage and ack the original, rather than a same-
      // queue nack-requeue (which busy-loops on a persistently-failing
      // message with no delay at all; that's exactly what happened before
      // this queue had a retry topology to route into).
      const target = getNextRetryTarget(msg.properties.headers, STOCK_RESERVATION_RESULTS);
      channel.sendToQueue(target, msg.content, { ...msg.properties, persistent: true });
      channel.ack(msg);
      if (target === STOCK_RESERVATION_RESULTS.dlq) {
        this.logger.error(
          `Reservation result for order ${payload.order_id} exhausted all retries — routed to DLQ`,
        );
      }
    }
  }
}
