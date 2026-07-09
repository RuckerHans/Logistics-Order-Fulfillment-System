// RabbitMQ message contracts — project-plan.md Section 5.3, 5.4

export interface ReserveStockMessage {
  traceId: string;
  orderId: string;
  items: { sku: string; qty: number }[];
}

export interface StockReservationResult {
  traceId: string;
  orderId: string;
  status: 'RESERVED' | 'INSUFFICIENT_STOCK';
  unavailableItems?: { sku: string; requestedQty: number; availableQty: number }[];
}

export interface NotifyMessage {
  traceId: string;
  orderId: string;
  customerId: string;
  type: 'ORDER_PLACED' | 'PAYMENT_CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  channel: 'EMAIL' | 'SMS';
}
