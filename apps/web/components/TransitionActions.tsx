"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { useTransitionOrderMutation, rtkErrorMessages } from "@/store/api";
import { toastAdded } from "@/store/slices/uiSlice";
import { nextTransitions } from "@/lib/statusMachine";
import { STATUS_STYLE } from "@/lib/statusStyles";
import { Button } from "@/components/ui/button";
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
      {targets.map((target) => {
        const Icon = STATUS_STYLE[target]?.icon;
        const pending = pendingTarget === target;
        const isCancel = target === "CANCELLED";
        return (
          <Button
            key={target}
            type="button"
            variant={isCancel ? "outline" : undefined}
            onClick={() => transition(target)}
            disabled={isLoading}
            className={
              isCancel
                ? "border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                : "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            }
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : Icon && <Icon className="size-4" />}
            {pending ? "Updating…" : `Mark as ${STATUS_STYLE[target]?.label ?? target}`}
          </Button>
        );
      })}
    </div>
  );
}
