import Link from "next/link";
import { fetchFlags, fetchFlagsByOrder } from "@/lib/api";
import { SeverityBadge } from "@/components/SeverityBadge";
import { RefreshButton } from "@/components/RefreshButton";
import { formatDateTime } from "@/lib/format";

export default async function FraudPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const sp = await searchParams;
  const orderId = sp.orderId?.trim();

  let flags: Awaited<ReturnType<typeof fetchFlags>> = [];
  let error: string | null = null;
  try {
    flags = orderId ? await fetchFlagsByOrder(orderId) : await fetchFlags();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load fraud flags.";
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Fraud Flags</h1>
        <RefreshButton />
      </div>

      <form className="mt-6 flex gap-2" action="/fraud">
        <input
          type="text"
          name="orderId"
          defaultValue={orderId ?? ""}
          placeholder="Filter by order ID"
          className="w-80 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-500 focus:outline-none"
        />
        <button type="submit" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Filter
        </button>
        {orderId && (
          <Link
            href="/fraud"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear
          </Link>
        )}
      </form>

      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not reach the fraud service: {error}
        </div>
      )}

      {!error && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Rule</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Flagged At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {flags.map((flag) => (
                <tr key={flag.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    <Link href={`/orders/${flag.order_id}`} className="hover:underline">
                      {flag.order_id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{flag.rule_name}</td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={flag.severity} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{flag.reason}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDateTime(flag.created_at)}</td>
                </tr>
              ))}
              {flags.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    {orderId ? "No flags for this order." : "No fraud flags recorded."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
