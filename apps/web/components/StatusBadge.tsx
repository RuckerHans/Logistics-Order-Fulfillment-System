import type { OrderStatus } from "@/lib/types";
import { STATUS_STYLE } from "@/lib/statusStyles";

export function StatusBadge({ status }: { status: OrderStatus }) {
  const style = STATUS_STYLE[status] ?? { pill: "bg-gray-100 text-gray-800", label: status };
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style.pill}`}>
      {style.label}
    </span>
  );
}
