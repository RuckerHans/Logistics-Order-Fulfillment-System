"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

export default function OrderDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? error);
  }, [error]);

  return (
    <ErrorState
      title="Couldn't load this order"
      message="Something went wrong while loading this order's details. Please try again."
      actionLabel="Try again"
      onAction={reset}
    />
  );
}
