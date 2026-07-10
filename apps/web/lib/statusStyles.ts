import type { OrderStatus, FraudSeverity } from "./types";

// Order status color mapping: the five in-flight pipeline stages read as an
// ordinal progression (single hue, light -> dark = further along), while the
// two terminal states borrow the reserved status palette (good / critical)
// since they carry real semantic weight ("succeeded" / "failed"), not just
// position in a sequence. Colors never carry meaning alone — every badge
// pairs the dot with a text label.
export const STATUS_STYLE: Record<OrderStatus, { dot: string; label: string }> = {
  PLACED: { dot: "#86b6ef", label: "Placed" },
  PAYMENT_CONFIRMED: { dot: "#5598e7", label: "Payment Confirmed" },
  PICKING: { dot: "#2a78d6", label: "Picking" },
  PACKED: { dot: "#1c5cab", label: "Packed" },
  SHIPPED: { dot: "#104281", label: "Shipped" },
  DELIVERED: { dot: "#0ca30c", label: "Delivered" },
  CANCELLED: { dot: "#d03b3b", label: "Cancelled" },
};

// Fraud severity uses the same reserved status palette (good/warning/critical)
// since severity is literally a state, not a category to distinguish.
export const SEVERITY_STYLE: Record<FraudSeverity, { dot: string; label: string }> = {
  low: { dot: "#0ca30c", label: "Low" },
  medium: { dot: "#fab219", label: "Medium" },
  high: { dot: "#d03b3b", label: "High" },
};
