"use client";

import { useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { toastAdded } from "@/store/slices/uiSlice";

export function DebugRuntimePanel({ label }: { label: string }) {
  const dispatch = useAppDispatch();
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    throw new Error(`Manual ${label} error`);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2 rounded-md border border-dashed border-red-300 bg-red-50 p-3 text-sm">
      <button
        type="button"
        onClick={() => dispatch(toastAdded({ type: "success", message: `Test toast from ${label}` }))}
        className="rounded-md bg-gray-900 px-3 py-1.5 text-white"
      >
        Fire toast
      </button>

      <button
        type="button"
        onClick={() => setShouldThrow(true)}
        className="rounded-md border border-red-300 px-3 py-1.5 text-red-700"
      >
        Trigger error.tsx
      </button>
    </div>
  );
}