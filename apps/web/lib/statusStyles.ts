import type { ComponentType } from "react";
import {
  Package,
  CreditCard,
  PackageSearch,
  PackageCheck,
  Truck,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react";
import type { OrderStatus, FraudSeverity } from "./types";

// Order status styling: the five in-flight pipeline stages read as an
// ordinal progression (single hue, increasingly saturated = further along),
// while the two terminal states borrow the reserved status palette
// (good / critical) since they carry real semantic weight ("succeeded" /
// "failed"), not just position in a sequence.
//
// `pill` is the tinted badge background + text used by StatusBadge (dot +
// text on a soft fill, not a solid block — refined SaaS-table convention).
// `dotClass` is the small saturated indicator dot inside the pill.
// `dot` is the equivalent hex, used where Tailwind classes can't reach
// (recharts' `fill` prop) — chart bars specifically.
export const STATUS_STYLE: Record<
  OrderStatus,
  { pill: string; dotClass: string; dot: string; label: string; icon: ComponentType<{ className?: string }> }
> = {
  PLACED: { pill: "bg-blue-50 text-blue-600", dotClass: "bg-blue-500", dot: "#3b82f6", label: "Placed", icon: Package },
  PAYMENT_CONFIRMED: {
    pill: "bg-blue-50 text-blue-700",
    dotClass: "bg-blue-600",
    dot: "#2563eb",
    label: "Payment Confirmed",
    icon: CreditCard,
  },
  PICKING: {
    pill: "bg-blue-100 text-blue-700",
    dotClass: "bg-blue-600",
    dot: "#2563eb",
    label: "Picking",
    icon: PackageSearch,
  },
  PACKED: {
    pill: "bg-blue-100 text-blue-800",
    dotClass: "bg-blue-700",
    dot: "#1d4ed8",
    label: "Packed",
    icon: PackageCheck,
  },
  SHIPPED: { pill: "bg-blue-100 text-blue-900", dotClass: "bg-blue-800", dot: "#1e40af", label: "Shipped", icon: Truck },
  DELIVERED: {
    pill: "bg-green-50 text-green-700",
    dotClass: "bg-green-600",
    dot: "#16a34a",
    label: "Delivered",
    icon: CheckCircle2,
  },
  CANCELLED: {
    pill: "bg-red-50 text-red-700",
    dotClass: "bg-red-600",
    dot: "#dc2626",
    label: "Cancelled",
    icon: XCircle,
  },
};

// Fraud severity uses the same reserved status palette (good/warning/critical)
// since severity is literally a state, not a category to distinguish.
export const SEVERITY_STYLE: Record<
  FraudSeverity,
  { pill: string; dotClass: string; label: string; icon: ComponentType<{ className?: string }> }
> = {
  low: { pill: "bg-green-50 text-green-700", dotClass: "bg-green-600", label: "Low", icon: ShieldCheck },
  medium: { pill: "bg-amber-50 text-amber-700", dotClass: "bg-amber-600", label: "Medium", icon: ShieldAlert },
  high: { pill: "bg-red-50 text-red-700", dotClass: "bg-red-600", label: "High", icon: ShieldX },
};
