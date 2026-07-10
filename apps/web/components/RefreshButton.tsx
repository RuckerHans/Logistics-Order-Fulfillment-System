"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

// Manual refresh: re-runs the enclosing Server Component's data fetch via
// router.refresh() — still a server-side fetch against the backend, so no
// client-side proxy route is needed for this case.
export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {isPending ? "Refreshing…" : "Refresh"}
    </button>
  );
}
