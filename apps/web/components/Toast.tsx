"use client";

import { useEffect } from "react";
import type { Toast as ToastData } from "@/store/slices/uiSlice";

const TYPE_STYLE: Record<ToastData["type"], string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-gray-200 bg-white text-gray-700",
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

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm shadow-sm ${TYPE_STYLE[toast.type]}`}
    >
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="text-current opacity-60 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
