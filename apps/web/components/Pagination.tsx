import Link from "next/link";

export function Pagination({
  page,
  totalPages,
  limit,
  basePath = "/orders",
}: {
  page: number;
  totalPages: number;
  limit: number;
  basePath?: string;
}) {
  if (totalPages <= 1) return null;
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);

  return (
    <div className="flex items-center justify-between border-t border-gray-200 pt-4 text-sm">
      {page > 1 ? (
        <Link href={`${basePath}?page=${prev}&limit=${limit}`} className="font-medium text-gray-700 hover:text-gray-900">
          ← Previous
        </Link>
      ) : (
        <span className="text-gray-300">← Previous</span>
      )}
      <span className="text-gray-500">
        Page {page} of {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={`${basePath}?page=${next}&limit=${limit}`} className="font-medium text-gray-700 hover:text-gray-900">
          Next →
        </Link>
      ) : (
        <span className="text-gray-300">Next →</span>
      )}
    </div>
  );
}
