import { Inbox } from "lucide-react";

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-400">
      <Inbox className="size-6 text-gray-300" />
      {label}
    </div>
  );
}
