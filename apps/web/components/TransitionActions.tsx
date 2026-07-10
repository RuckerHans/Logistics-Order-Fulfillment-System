"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nextTransitions } from "@/lib/statusMachine";
import { STATUS_STYLE } from "@/lib/statusStyles";
import type { OrderStatus } from "@/lib/types";

export function TransitionActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targets = nextTransitions(status);

  async function transition(newStatus: OrderStatus) {
    setPending(newStatus);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/transition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.message === "string" ? data.message : "Transition failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the order service.");
    } finally {
      setPending(null);
    }
  }

  if (targets.length === 0) {
    return <p className="text-sm text-gray-400">No further transitions — this order is in a terminal state.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {targets.map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => transition(target)}
            disabled={pending !== null}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {pending === target ? "Updating…" : `Mark as ${STATUS_STYLE[target]?.label ?? target}`}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
