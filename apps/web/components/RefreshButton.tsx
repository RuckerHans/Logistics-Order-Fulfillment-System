"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Manual refresh: re-runs the enclosing Server Component's data fetch via
// router.refresh() — still a server-side fetch against the backend, so no
// client-side proxy route is needed for this case.
export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className="border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-70"
    >
      <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
      {isPending ? "Refreshing…" : "Refresh"}
    </Button>
  );
}
