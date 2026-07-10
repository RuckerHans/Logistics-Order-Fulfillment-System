import { Job } from 'bullmq';
import { DeliveryReminderJobData } from './job-payloads';
import { DeliveryReminderProcessor } from './delivery-reminder.processor';

describe('DeliveryReminderProcessor', () => {
  it('logs the reminder without throwing (simulated only — no outbound channel)', async () => {
    const processor = new DeliveryReminderProcessor();
    const job = {
      data: { traceId: 'trace-1', orderId: 'order-1', customerId: 'cust-1' },
    } as Job<DeliveryReminderJobData>;

    await expect(processor.process(job)).resolves.toBeUndefined();
  });
});
