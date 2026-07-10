"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Nice-to-have live polling for the order detail page. Ticks call
// router.refresh(), which re-runs the Server Component fetch — still
// server-side against ORDER_API_URL, no client-side proxy route needed.
export function AutoRefreshToggle({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);

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
        onChange={(e) => setEnabled(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-300"
      />
      Auto-refresh ({Math.round(intervalMs / 1000)}s)
    </label>
  );
}
