import type { FraudSeverity } from "@/lib/types";
import { SEVERITY_STYLE } from "@/lib/statusStyles";

export function SeverityBadge({ severity }: { severity: FraudSeverity }) {
  const style = SEVERITY_STYLE[severity] ?? { dot: "#898781", label: severity };
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: style.dot }} aria-hidden />
      {style.label}
    </span>
  );
}
