import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { getNextRetryTarget, NOTIFY } from '@logistics/contracts';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { NotificationChannel } from '../notifications/entities/notification-log.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { RABBITMQ_CHANNEL } from './rabbitmq.module';

interface NotifyPayload {
  trace_id: string;
  order_id: string;
  customer_id: string;
  type: string;
  channel: NotificationChannel;
}

@Injectable()
export class NotifyConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotifyConsumer.name);

  constructor(
    @Inject(RABBITMQ_CHANNEL) private readonly channel: ChannelWrapper,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // assertQueue here too, even though RabbitMQModule's own setup already
    // does it: amqp-connection-manager runs every registered setup function
    // concurrently (Promise.all), not in registration order, so this
    // addSetup callback can't rely on that other setup having finished
    // first. Against a fresh vhost with no pre-existing queue, consume()
    // would otherwise race assertQueue() and fail with 404 NOT_FOUND —
    // assertQueue is idempotent, so asserting again here is free.
    await this.channel.addSetup((channel: ConfirmChannel) =>
      channel
        .assertQueue(NOTIFY.queue, { durable: true })
        .then(() => channel.consume(NOTIFY.queue, (msg) => this.handle(channel, msg))),
    );
  }

  private async handle(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) {
      return;
    }

    let payload: NotifyPayload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch (err) {
      this.logger.error('Malformed notify payload, routing straight to DLQ', err as Error);
      channel.sendToQueue(NOTIFY.dlq, msg.content, { persistent: true });
      channel.ack(msg);
      return;
    }

    try {
      await this.notificationsService.send({
        orderId: payload.order_id,
        customerId: payload.customer_id,
        type: payload.type,
        channel: payload.channel,
      });
      channel.ack(msg);
    } catch (err) {
      this.logger.error(`Failed to process notify for order ${payload.order_id}`, err as Error);
      const target = getNextRetryTarget(msg.properties.headers, NOTIFY);
      channel.sendToQueue(target, msg.content, { ...msg.properties, persistent: true });
      channel.ack(msg);
      if (target === NOTIFY.dlq) {
        this.logger.error(`Order ${payload.order_id}'s notify exhausted all retries — routed to DLQ`);
      }
    }
  }
}
