import type { OrderStatus } from "@/lib/types";
import { STATUS_STYLE } from "@/lib/statusStyles";

export function StatusBadge({ status }: { status: OrderStatus }) {
  const style = STATUS_STYLE[status] ?? { dot: "#898781", label: status };
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: style.dot }} aria-hidden />
      {style.label}
    </span>
  );
}
