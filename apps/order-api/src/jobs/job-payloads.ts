// project-plan.md Section 5.5 — internal to Order API only, not cross-service.

export interface PaymentTimeoutJobData {
  traceId: string;
  orderId: string;
}

export interface DeliveryReminderJobData {
  traceId: string;
  orderId: string;
  customerId: string;
}

export interface GenerateInvoiceJobData {
  traceId: string;
  orderId: string;
}
