// Plain constants, no NestJS module dependency — both JobsModule (queue
// registration + processors) and OrdersService (enqueueing) import these
// directly so the queue name string can't drift between the two sides.
export const PAYMENT_TIMEOUT_QUEUE = 'payment-timeout';
export const DELIVERY_REMINDER_QUEUE = 'delivery-reminder';
export const GENERATE_INVOICE_QUEUE = 'generate-invoice-pdf';
