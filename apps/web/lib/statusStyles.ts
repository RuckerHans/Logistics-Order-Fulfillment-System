import type { OrderStatus, FraudSeverity } from "./types";

// Order status styling: the five in-flight pipeline stages read as an
// ordinal progression (single hue, light -> saturated = further along),
// while the two terminal states borrow the reserved status palette
// (good / critical) since they carry real semantic weight ("succeeded" /
// "failed"), not just position in a sequence.
//
// `pill` is the soft badge treatment (bg + text) used by StatusBadge.
// `dot` is a fully-saturated representative hex for the same hue, used
// where a pale badge background would read as washed-out — chart bars
// (TimeInStatusChart) specifically.
export const STATUS_STYLE: Record<OrderStatus, { pill: string; dot: string; label: string }> = {
  PLACED: { pill: "bg-blue-50 text-blue-700", dot: "#86b6ef", label: "Placed" },
  PAYMENT_CONFIRMED: { pill: "bg-blue-100 text-blue-700", dot: "#5598e7", label: "Payment Confirmed" },
  PICKING: { pill: "bg-blue-200 text-blue-800", dot: "#2a78d6", label: "Picking" },
  PACKED: { pill: "bg-blue-300 text-blue-900", dot: "#1c5cab", label: "Packed" },
  SHIPPED: { pill: "bg-blue-400 text-blue-950", dot: "#104281", label: "Shipped" },
  DELIVERED: { pill: "bg-green-100 text-green-800", dot: "#0ca30c", label: "Delivered" },
  CANCELLED: { pill: "bg-red-100 text-red-800", dot: "#d03b3b", label: "Cancelled" },
};

// Fraud severity uses the same reserved status palette (good/warning/critical)
// since severity is literally a state, not a category to distinguish.
export const SEVERITY_STYLE: Record<FraudSeverity, { pill: string; label: string }> = {
  low: { pill: "bg-green-100 text-green-800", label: "Low" },
  medium: { pill: "bg-amber-100 text-amber-800", label: "Medium" },
  high: { pill: "bg-red-100 text-red-800", label: "High" },
};
