import type { OrderStatus } from "./types";

export const ORDER_STATUSES: OrderStatus[] = [
  "PLACED",
  "PAYMENT_CONFIRMED",
  "PICKING",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

// Mirrors the forward-only state machine enforced by the order-api. Kept in
// sync manually (see brief) — used only to decide which transition buttons
// to render; the backend is still the source of truth and re-validates.
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ["PAYMENT_CONFIRMED", "CANCELLED"],
  PAYMENT_CONFIRMED: ["PICKING"],
  PICKING: ["PACKED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function nextTransitions(status: OrderStatus): OrderStatus[] {
  return TRANSITIONS[status] ?? [];
}
