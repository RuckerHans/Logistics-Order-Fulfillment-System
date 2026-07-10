export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center rounded-md border border-dashed border-gray-200 text-sm text-gray-400">
      {label}
    </div>
  );
}
