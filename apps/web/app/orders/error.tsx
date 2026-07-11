"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

export default function OrdersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? error);
  }, [error]);

  return (
    <ErrorState
      title="Couldn't load orders"
      message="Something went wrong while loading the orders list. Please try again."
      actionLabel="Try again"
      onAction={reset}
    />
  );
}
