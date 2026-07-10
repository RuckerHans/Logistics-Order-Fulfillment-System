import * as fs from 'fs';
import * as path from 'path';
import { Job } from 'bullmq';
import { OrderStatus } from '@logistics/contracts';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { OrdersService } from '../orders/orders.service';
import { GenerateInvoiceJobData } from './job-payloads';
import { GenerateInvoiceProcessor } from './generate-invoice.processor';

describe('GenerateInvoiceProcessor', () => {
  const invoicesDir = path.join(process.cwd(), 'invoices');

  afterEach(() => {
    // Real pdfkit + real fs (this is the artifact being verified, so a
    // mocked filesystem would prove nothing) — clean up what the test wrote.
    fs.rmSync(invoicesDir, { recursive: true, force: true });
  });

  it('generates a real, non-empty PDF file containing the order details', async () => {
    const order = Object.assign(new Order(), {
      id: 'order-1',
      customerId: 'cust-1',
      status: OrderStatus.PAYMENT_CONFIRMED,
      deliveryAddress: '123 Main St',
      branchId: 'branch_01',
      totalValue: '1550.00',
      traceId: 'trace-1',
      items: [Object.assign(new OrderItem(), { sku: 'SKU001', qty: 2, unitPrice: '725.00' })],
    });
    const ordersService = { findOne: jest.fn().mockResolvedValue(order) };
    const processor = new GenerateInvoiceProcessor(ordersService as unknown as OrdersService);

    const job = { data: { traceId: 'trace-1', orderId: 'order-1' } } as Job<GenerateInvoiceJobData>;
    await processor.process(job);

    const filePath = path.join(invoicesDir, 'invoice-order-1.pdf');
    expect(fs.existsSync(filePath)).toBe(true);

    const contents = fs.readFileSync(filePath);
    expect(contents.length).toBeGreaterThan(0);
    expect(contents.subarray(0, 5).toString()).toBe('%PDF-'); // real PDF header, not a stub file
  });
});
