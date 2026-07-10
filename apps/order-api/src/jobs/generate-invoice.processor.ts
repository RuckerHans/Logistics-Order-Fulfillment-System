import * as fs from 'fs';
import * as path from 'path';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import PDFDocument from 'pdfkit';
import { OrdersService } from '../orders/orders.service';
import { GenerateInvoiceJobData } from './job-payloads';
import { GENERATE_INVOICE_QUEUE } from './queue-names';

@Processor(GENERATE_INVOICE_QUEUE)
export class GenerateInvoiceProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateInvoiceProcessor.name);

  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  async process(job: Job<GenerateInvoiceJobData>): Promise<void> {
    const { orderId, traceId } = job.data;
    const order = await this.ordersService.findOne(orderId);

    const dir = path.join(process.cwd(), 'invoices');
    await fs.promises.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `invoice-${orderId}.pdf`);

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).text('Invoice', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Order ID: ${order.id}`);
    doc.text(`Trace ID: ${traceId}`);
    doc.text(`Customer ID: ${order.customerId}`);
    doc.text(`Delivery Address: ${order.deliveryAddress}`);
    doc.moveDown();
    doc.text('Items:');
    for (const item of order.items) {
      doc.text(`  ${item.sku} x${item.qty} @ ${item.unitPrice}`);
    }
    doc.moveDown();
    doc.text(`Total: ${order.totalValue}`, { align: 'right' });
    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    this.logger.log(`Generated invoice PDF for order ${orderId} at ${filePath} (trace_id=${traceId})`);
  }
}
