"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { autoRefreshEnabledSet } from "@/store/slices/uiSlice";

// Nice-to-have live polling for the order detail page. Ticks call
// router.refresh(), which re-runs the Server Component fetch — still
// server-side against ORDER_API_URL, no client-side proxy route needed.
// The on/off preference lives in ui.autoRefreshEnabled so it's shared across
// every page with an auto-refresh toggle, not local to this instance.
export function AutoRefreshToggle({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const enabled = useAppSelector((state) => state.ui.autoRefreshEnabled);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, router]);

  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => dispatch(autoRefreshEnabledSet(e.target.checked))}
        className="h-3.5 w-3.5 rounded border-gray-300"
      />
      Auto-refresh ({Math.round(intervalMs / 1000)}s)
    </label>
  );
}
