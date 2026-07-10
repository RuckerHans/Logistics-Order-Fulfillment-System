import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DeliveryReminderJobData } from './job-payloads';
import { DELIVERY_REMINDER_QUEUE } from './queue-names';

@Processor(DELIVERY_REMINDER_QUEUE)
export class DeliveryReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryReminderProcessor.name);

  async process(job: Job<DeliveryReminderJobData>): Promise<void> {
    const { orderId, customerId, traceId } = job.data;

    // Simulated reminder, logged only — Section 5.4's NotifyMessage.type enum
    // has no DELIVERY_REMINDER value, so this isn't routed through
    // Notification Service; it's Order API's own internal action.
    this.logger.log(
      `Delivery reminder: order ${orderId} for customer ${customerId} is arriving soon (trace_id=${traceId})`,
    );
  }
}
