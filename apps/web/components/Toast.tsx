"use client";

import { useEffect } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import type { Toast as ToastData } from "@/store/slices/uiSlice";

// Refined notification card: white surface, colored left accent + icon,
// dark body text — not a solid color block, which reads heavier/louder.
const TYPE_STYLE: Record<ToastData["type"], { border: string; icon: string; iconComponent: typeof CheckCircle2 }> = {
  success: { border: "border-l-green-600", icon: "text-green-600", iconComponent: CheckCircle2 },
  error: { border: "border-l-red-600", icon: "text-red-600", iconComponent: XCircle },
  info: { border: "border-l-indigo-600", icon: "text-indigo-600", iconComponent: Info },
};

export function Toast({
  toast,
  onDismiss,
  durationMs = 4000,
}: {
  toast: ToastData;
  onDismiss: (id: string) => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const id = setTimeout(() => onDismiss(toast.id), durationMs);
    return () => clearTimeout(id);
  }, [toast.id, durationMs, onDismiss]);

  const { border, icon, iconComponent: Icon } = TYPE_STYLE[toast.type];

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border border-l-4 border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-md ${border}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${icon}`} />
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="text-gray-400 hover:text-gray-600"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
