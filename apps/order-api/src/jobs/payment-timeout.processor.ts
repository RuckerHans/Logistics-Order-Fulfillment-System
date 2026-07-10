import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { OrderStatus } from '@logistics/contracts';
import { Job } from 'bullmq';
import { InvalidTransitionException } from '../orders/exceptions/invalid-transition.exception';
import { OrdersService } from '../orders/orders.service';
import { PaymentTimeoutJobData } from './job-payloads';
import { PAYMENT_TIMEOUT_QUEUE } from './queue-names';

@Processor(PAYMENT_TIMEOUT_QUEUE)
export class PaymentTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentTimeoutProcessor.name);

  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  async process(job: Job<PaymentTimeoutJobData>): Promise<void> {
    const { orderId, traceId } = job.data;

    try {
      // Reuses the existing transactional, row-locked transition() from
      // Section 17/Phase 2 — no separate transition path for jobs. Its own
      // state-machine check (inside the same lock) is the authoritative
      // answer to "is this order still PLACED", so there's no separate
      // pre-check-then-act race to worry about here.
      await this.ordersService.transition(orderId, OrderStatus.CANCELLED);
      this.logger.log(
        `payment-timeout: order ${orderId} cancelled — no payment confirmation within the window (trace_id=${traceId})`,
      );
    } catch (err) {
      if (err instanceof InvalidTransitionException) {
        this.logger.log(
          `payment-timeout: order ${orderId} already moved past PLACED — no-op (trace_id=${traceId})`,
        );
        return;
      }
      throw err; // genuine failure (e.g. transient DB error) — let BullMQ retry
    }
  }
}
