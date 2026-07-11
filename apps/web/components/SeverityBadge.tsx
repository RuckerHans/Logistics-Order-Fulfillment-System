import type { FraudSeverity } from "@/lib/types";
import { SEVERITY_STYLE } from "@/lib/statusStyles";
import { Badge } from "@/components/ui/badge";

export function SeverityBadge({ severity }: { severity: FraudSeverity }) {
  const style = SEVERITY_STYLE[severity] ?? { pill: "bg-gray-100 text-gray-700", dotClass: "bg-gray-500", label: severity };
  return (
    <Badge className={`h-6 gap-1.5 border-0 px-2.5 font-medium ${style.pill}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${style.dotClass}`} aria-hidden />
      {style.label}
    </Badge>
  );
}
