// BullMQ job payloads — internal to Order API only, not cross-service.
// project-plan.md Section 5.5

export interface PaymentTimeoutJob {
  traceId: string;
  orderId: string;
}

export interface DeliveryReminderJob {
  traceId: string;
  orderId: string;
  customerId: string;
}

export interface GenerateInvoiceJob {
  traceId: string;
  orderId: string;
}
