"use client";

import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { useTransitionOrderMutation, rtkErrorMessages } from "@/store/api";
import { toastAdded } from "@/store/slices/uiSlice";
import { nextTransitions } from "@/lib/statusMachine";
import { STATUS_STYLE } from "@/lib/statusStyles";
import type { OrderStatus } from "@/lib/types";

export function TransitionActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [transitionOrder, { isLoading, originalArgs }] = useTransitionOrderMutation();
  const targets = nextTransitions(status);
  const pendingTarget = isLoading ? originalArgs?.newStatus : undefined;

  async function transition(newStatus: OrderStatus) {
    try {
      await transitionOrder({ id: orderId, newStatus }).unwrap();
      dispatch(toastAdded({ type: "success", message: `Order marked as ${STATUS_STYLE[newStatus]?.label ?? newStatus}.` }));
      router.refresh();
    } catch (err) {
      const [message] = rtkErrorMessages(err);
      dispatch(toastAdded({ type: "error", message }));
    }
  }

  if (targets.length === 0) {
    return <p className="text-sm text-gray-400">No further transitions — this order is in a terminal state.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((target) => (
        <button
          key={target}
          type="button"
          onClick={() => transition(target)}
          disabled={isLoading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pendingTarget === target ? "Updating…" : `Mark as ${STATUS_STYLE[target]?.label ?? target}`}
        </button>
      ))}
    </div>
  );
}
