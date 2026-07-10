import 'reflect-metadata';
import { getQueueToken } from '@nestjs/bullmq';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';
import { AppModule } from './app.module';
import { globalValidationPipe } from './common/pipes/global-validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { setupBullBoard } from './jobs/bull-board.setup';
import {
  DELIVERY_REMINDER_QUEUE,
  GENERATE_INVOICE_QUEUE,
  PAYMENT_TIMEOUT_QUEUE,
} from './jobs/queue-names';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(globalValidationPipe);
  app.useGlobalFilters(new HttpExceptionFilter());

  // Section 15 — no auth on /admin/queues in this dev setup; flagged as
  // needing a guard (or to be disabled) before any production-adjacent use.
  const paymentTimeoutQueue = app.get<Queue>(getQueueToken(PAYMENT_TIMEOUT_QUEUE));
  const deliveryReminderQueue = app.get<Queue>(getQueueToken(DELIVERY_REMINDER_QUEUE));
  const generateInvoiceQueue = app.get<Queue>(getQueueToken(GENERATE_INVOICE_QUEUE));
  const bullBoardAdapter = setupBullBoard([
    paymentTimeoutQueue,
    deliveryReminderQueue,
    generateInvoiceQueue,
  ]);
  app.use('/admin/queues', bullBoardAdapter.getRouter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
