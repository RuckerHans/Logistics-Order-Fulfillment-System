import { ShoppingBag, DollarSign, ListChecks, TrendingUp, Clock } from "lucide-react";
import { fetchSummary, fetchOrdersPerHour, fetchTimeInStatus } from "@/lib/api";
import { OrdersPerHourChart } from "@/components/charts/OrdersPerHourChart";
import { TimeInStatusChart } from "@/components/charts/TimeInStatusChart";
import { RefreshButton } from "@/components/RefreshButton";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
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
      <PageHeader title="Analytics" actions={<RefreshButton />} />

      {anyError && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some analytics data could not be loaded from the analytics service.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <ShoppingBag className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-gray-500">Total Orders Placed</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary ? summary.totalOrdersPlaced.toLocaleString() : "—"}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <DollarSign className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm text-gray-500">Total Order Value</p>
              <p className="text-2xl font-bold text-gray-900">{summary ? formatMoney(summary.totalOrderValue) : "—"}</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <ListChecks className="size-5" />
            </div>
            <p className="text-sm text-gray-500">Orders by Status</p>
          </div>
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
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5 shadow-sm">
          <div className="flex items-center gap-2 text-gray-900">
            <TrendingUp className="size-4 text-violet-600" />
            <h2 className="font-semibold">Orders per Hour</h2>
          </div>
          <p className="text-sm text-gray-500">Last 24 hours</p>
          <div className="mt-4">
            <OrdersPerHourChart data={oph} />
          </div>
        </Card>
        <Card className="p-5 shadow-sm">
          <div className="flex items-center gap-2 text-gray-900">
            <Clock className="size-4 text-indigo-600" />
            <h2 className="font-semibold">Average Time in Status</h2>
          </div>
          <p className="text-sm text-gray-500">Before transitioning to the next status</p>
          <div className="mt-4">
            <TimeInStatusChart data={tis} />
          </div>
        </Card>
      </div>
    </div>
  );
}
