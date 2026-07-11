export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white text-sm text-gray-400">
      {label}
    </div>
  );
}
