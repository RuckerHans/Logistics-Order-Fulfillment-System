export enum OrderStatus {
  PLACED = 'PLACED',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  PICKING = 'PICKING',
  PACKED = 'PACKED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export interface OrderItem {
  sku: string;
  qty: number;
  unitPrice: number;
}

export interface OrderMetadata {
  branchId: string;
}

export interface OrderStatusChangedEvent {
  schemaVersion: number; // 1. See project-plan.md Section 19 (schema evolution rules)
  traceId: string; // UUID generated once at order placement, propagated everywhere
  orderId: string;
  customerId: string;
  previousStatus: OrderStatus | null; // null on the first event
  newStatus: OrderStatus;
  timestamp: string; // ISO 8601
  deliveryAddress: string;
  orderValue: number;
  items: OrderItem[];
  metadata: OrderMetadata;
}
