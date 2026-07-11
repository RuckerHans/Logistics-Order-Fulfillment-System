import { notFound } from "next/navigation";
import { fetchOrder } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { TransitionActions } from "@/components/TransitionActions";
import { RefreshButton } from "@/components/RefreshButton";
import { AutoRefreshToggle } from "@/components/AutoRefreshToggle";
import { formatDateTime, formatMoney } from "@/lib/format";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await fetchOrder(id);
  if (!order) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900" title={order.id}>
            Order {order.id}
          </h1>
          <p className="mt-1 truncate text-sm text-gray-500" title={order.traceId}>
            trace: {order.traceId}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AutoRefreshToggle />
          <RefreshButton />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-medium text-gray-500">Status</h2>
          <div className="mt-2">
            <StatusBadge status={order.status} />
          </div>
          <div className="mt-4">
            <TransitionActions orderId={order.id} status={order.status} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm">
          <dl className="space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">Customer</dt>
              <dd className="truncate font-mono text-xs" title={order.customerId}>
                {order.customerId}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">Branch</dt>
              <dd>{order.branchId}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">Delivery Address</dt>
              <dd className="text-right">{order.deliveryAddress}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">Total</dt>
              <dd>{formatMoney(order.totalValue)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">Created</dt>
              <dd>{formatDateTime(order.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-gray-500">Updated</dt>
              <dd>{formatDateTime(order.updatedAt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-medium text-gray-500">Items</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="py-2 pr-4 font-medium">SKU</th>
                <th className="py-2 pr-4 font-medium">Qty</th>
                <th className="py-2 pr-4 font-medium">Unit Price</th>
                <th className="py-2 font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-100">
                  <td className="py-2 pr-4">{item.sku}</td>
                  <td className="py-2 pr-4">{item.qty}</td>
                  <td className="py-2 pr-4">{formatMoney(item.unitPrice)}</td>
                  <td className="py-2">{formatMoney(Number(item.unitPrice) * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
