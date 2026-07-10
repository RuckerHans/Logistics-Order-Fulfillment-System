import { OrderStatus } from '@logistics/contracts';
import { Job } from 'bullmq';
import { InvalidTransitionException } from '../orders/exceptions/invalid-transition.exception';
import { OrdersService } from '../orders/orders.service';
import { PaymentTimeoutJobData } from './job-payloads';
import { PaymentTimeoutProcessor } from './payment-timeout.processor';

describe('PaymentTimeoutProcessor', () => {
  let processor: PaymentTimeoutProcessor;
  let ordersService: jest.Mocked<Pick<OrdersService, 'transition'>>;

  const makeJob = (): Job<PaymentTimeoutJobData> =>
    ({ data: { traceId: 'trace-1', orderId: 'order-1' } }) as Job<PaymentTimeoutJobData>;

  beforeEach(() => {
    ordersService = { transition: jest.fn() };
    processor = new PaymentTimeoutProcessor(ordersService as unknown as OrdersService);
  });

  it('cancels the order when it is still PLACED', async () => {
    ordersService.transition.mockResolvedValue({} as any);

    await processor.process(makeJob());

    expect(ordersService.transition).toHaveBeenCalledWith('order-1', OrderStatus.CANCELLED);
  });

  it('no-ops when the order already moved past PLACED (InvalidTransitionException)', async () => {
    ordersService.transition.mockRejectedValue(
      new InvalidTransitionException(OrderStatus.PAYMENT_CONFIRMED, OrderStatus.CANCELLED),
    );

    await expect(processor.process(makeJob())).resolves.toBeUndefined();
  });

  it('propagates a genuine failure (e.g. a transient DB error) so BullMQ can retry', async () => {
    ordersService.transition.mockRejectedValue(new Error('connection reset'));

    await expect(processor.process(makeJob())).rejects.toThrow('connection reset');
  });
});
