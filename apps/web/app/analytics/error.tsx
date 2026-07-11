"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

export default function AnalyticsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? error);
  }, [error]);

  return (
    <ErrorState
      title="Couldn't load analytics"
      message="Something went wrong while loading analytics data. Please try again."
      actionLabel="Try again"
      onAction={reset}
    />
  );
}
