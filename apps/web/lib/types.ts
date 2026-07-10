// Local type definitions matching the backend JSON shapes. Deliberately not
// shared with packages/contracts — apps/web stays decoupled from the backend
// TS build graph.

export type OrderStatus =
  | "PLACED"
  | "PAYMENT_CONFIRMED"
  | "PICKING"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export interface OrderItem {
  id: string;
  orderId: string;
  sku: string;
  qty: number;
  unitPrice: string;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  deliveryAddress: string;
  branchId: string;
  totalValue: string;
  traceId: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface PaginatedOrders {
  data: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiErrorBody {
  statusCode: number;
  path?: string;
  timestamp?: string;
  message: string | string[];
  error?: string;
}

export interface AnalyticsSummary {
  totalOrdersPlaced: number;
  totalOrderValue: string;
  countsByStatus: Partial<Record<OrderStatus, number>>;
}

export interface OrdersPerHourPoint {
  hour: string;
  count: number;
}

export interface TimeInStatusPoint {
  status: OrderStatus;
  avgSeconds: number;
  sampleSize: number;
}

export type FraudSeverity = "low" | "medium" | "high";

export interface FraudFlag {
  id: number;
  order_id: string;
  rule_name: string;
  reason: string;
  severity: FraudSeverity;
  created_at: string;
}
