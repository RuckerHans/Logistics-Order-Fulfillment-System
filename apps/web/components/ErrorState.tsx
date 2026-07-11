import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Something went wrong",
  message,
  actionLabel,
  onAction,
}: {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center shadow-sm">
      <CircleAlert className="size-6 text-red-600" />
      <h2 className="text-base font-semibold text-red-800">{title}</h2>
      <p className="max-w-md text-sm text-red-700">{message}</p>
      {actionLabel && onAction && (
        <Button
          type="button"
          onClick={onAction}
          variant="outline"
          className="mt-1 border-red-300 bg-white text-red-700 hover:bg-red-50"
        >
          <RotateCcw className="size-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
