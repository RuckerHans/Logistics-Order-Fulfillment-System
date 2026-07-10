import Link from "next/link";
import { fetchOrders } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { RefreshButton } from "@/components/RefreshButton";
import { formatDateTime, formatMoney } from "@/lib/format";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.limit ?? "20", 10) || 20));

  let result: Awaited<ReturnType<typeof fetchOrders>> | null = null;
  let error: string | null = null;
  try {
    result = await fetchOrders(page, limit);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load orders.";
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
        <div className="flex items-center gap-3">
          <RefreshButton />
          <Link href="/orders/new" className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800">
            + New Order
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not reach the order service: {error}
        </div>
      )}

      {result && (
        <>
          <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.data.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      <Link href={`/orders/${order.id}`} className="hover:underline">
                        {order.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{order.customerId.slice(0, 8)}…</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatMoney(order.totalValue)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDateTime(order.createdAt)}</td>
                  </tr>
                ))}
                {result.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No orders yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Pagination page={result.page} totalPages={result.totalPages} limit={result.limit} />
          </div>
        </>
      )}
    </div>
  );
}
