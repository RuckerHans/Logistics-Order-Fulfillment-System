import Link from "next/link";
import { Plus } from "lucide-react";
import { fetchOrders } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/Pagination";
import { RefreshButton } from "@/components/RefreshButton";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
      <PageHeader
        title="Orders"
        actions={
          <>
            <RefreshButton />
            <Button
              render={<Link href="/orders/new" />}
              nativeButton={false}
              className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
            >
              <Plus className="size-4" />
              New Order
            </Button>
          </>
        }
      />

      {error && (
        <div className="mt-6">
          <ErrorState title="Couldn't load orders" message={`Could not reach the order service: ${error}`} />
        </div>
      )}

      {result && result.data.length === 0 && (
        <div className="mt-6">
          <EmptyState label="No orders yet." />
        </div>
      )}

      {result && result.data.length > 0 && (
        <>
          <Card className="mt-6 gap-0 overflow-hidden py-0 shadow-sm">
            <Table className="min-w-[640px]">
              <TableHeader className="bg-gray-50">
                <TableRow className="hover:bg-gray-50">
                  <TableHead className="px-4 py-3">Order</TableHead>
                  <TableHead className="px-4 py-3">Customer</TableHead>
                  <TableHead className="px-4 py-3">Status</TableHead>
                  <TableHead className="px-4 py-3">Total</TableHead>
                  <TableHead className="px-4 py-3">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.map((order) => (
                  <TableRow key={order.id} className="hover:bg-indigo-50/50">
                    <TableCell className="px-4 py-3 font-mono text-xs text-gray-700">
                      <Link href={`/orders/${order.id}`} className="hover:underline" title={order.id}>
                        {order.id.slice(0, 8)}…
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-xs text-gray-500" title={order.customerId}>
                      {order.customerId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="px-4 py-3 font-semibold text-gray-900">
                      {formatMoney(order.totalValue)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-500">{formatDateTime(order.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="mt-4">
            <Pagination page={result.page} totalPages={result.totalPages} limit={result.limit} />
          </div>
        </>
      )}
    </div>
  );
}
