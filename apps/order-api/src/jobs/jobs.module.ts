import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersModule } from '../orders/orders.module';
import { DeliveryReminderProcessor } from './delivery-reminder.processor';
import { GenerateInvoiceProcessor } from './generate-invoice.processor';
import { OutboxPollerService } from './outbox-poller.service';
import { PaymentTimeoutProcessor } from './payment-timeout.processor';
import {
  DELIVERY_REMINDER_QUEUE,
  GENERATE_INVOICE_QUEUE,
  PAYMENT_TIMEOUT_QUEUE,
} from './queue-names';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get<string>('REDIS_URL')!);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: PAYMENT_TIMEOUT_QUEUE },
      { name: DELIVERY_REMINDER_QUEUE },
      { name: GENERATE_INVOICE_QUEUE },
    ),
    // Processors need OrdersService (must call the existing transactional
    // transition(), never a separate path) — OrdersModule doesn't import
    // JobsModule back; it reaches the queue tokens via this module's
    // @Global() export instead, so there's no import cycle.
    OrdersModule,
  ],
  providers: [
    OutboxPollerService,
    PaymentTimeoutProcessor,
    DeliveryReminderProcessor,
    GenerateInvoiceProcessor,
  ],
  exports: [BullModule],
})
export class JobsModule {}
