import type { FraudSeverity } from "@/lib/types";
import { SEVERITY_STYLE } from "@/lib/statusStyles";

export function SeverityBadge({ severity }: { severity: FraudSeverity }) {
  const style = SEVERITY_STYLE[severity] ?? { pill: "bg-gray-100 text-gray-800", label: severity };
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style.pill}`}>
      {style.label}
    </span>
  );
}
