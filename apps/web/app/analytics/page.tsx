import { fetchSummary, fetchOrdersPerHour, fetchTimeInStatus } from "@/lib/api";
import { OrdersPerHourChart } from "@/components/charts/OrdersPerHourChart";
import { TimeInStatusChart } from "@/components/charts/TimeInStatusChart";
import { RefreshButton } from "@/components/RefreshButton";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMoney } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export default async function AnalyticsPage() {
  const [summaryRes, ophRes, tisRes] = await Promise.allSettled([
    fetchSummary(),
    fetchOrdersPerHour(24),
    fetchTimeInStatus(),
  ]);

  const summary = summaryRes.status === "fulfilled" ? summaryRes.value : null;
  const oph = ophRes.status === "fulfilled" ? ophRes.value : [];
  const tis = tisRes.status === "fulfilled" ? tisRes.value : [];
  const anyError = [summaryRes, ophRes, tisRes].some((r) => r.status === "rejected");

  const statusEntries = summary ? (Object.entries(summary.countsByStatus) as [OrderStatus, number][]) : [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
        <RefreshButton />
      </div>

      {anyError && (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some analytics data could not be loaded from the analytics service.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-medium text-gray-500">Total Orders Placed</h3>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {summary ? summary.totalOrdersPlaced.toLocaleString() : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-medium text-gray-500">Total Order Value</h3>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {summary ? formatMoney(summary.totalOrderValue) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-medium text-gray-500">Orders by Status</h3>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
            {statusEntries.length > 0 ? (
              statusEntries.map(([status, count]) => (
                <div key={status} className="flex items-center gap-1.5 text-sm">
                  <StatusBadge status={status} />
                  <span className="text-gray-500">{count}</span>
                </div>
              ))
            ) : (
              <span className="text-sm text-gray-400">No data</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-medium text-gray-900">Orders per Hour</h2>
          <p className="text-sm text-gray-500">Last 24 hours</p>
          <div className="mt-4">
            <OrdersPerHourChart data={oph} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-medium text-gray-900">Average Time in Status</h2>
          <p className="text-sm text-gray-500">Before transitioning to the next status</p>
          <div className="mt-4">
            <TimeInStatusChart data={tis} />
          </div>
        </div>
      </div>
    </div>
  );
}
