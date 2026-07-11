import { notFound } from "next/navigation";
import { fetchOrder } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { TransitionActions } from "@/components/TransitionActions";
import { RefreshButton } from "@/components/RefreshButton";
import { AutoRefreshToggle } from "@/components/AutoRefreshToggle";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDateTime, formatMoney } from "@/lib/format";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await fetchOrder(id);
  if (!order) notFound();

  return (
    <div>
      <PageHeader
        title={`Order ${order.id}`}
        titleAttr={order.id}
        subtitle={`trace: ${order.traceId}`}
        subtitleAttr={order.traceId}
        actions={
          <>
            <AutoRefreshToggle />
            <RefreshButton />
          </>
        }
      />

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card className="p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-500">Status</h2>
          <div className="mt-2">
            <StatusBadge status={order.status} />
          </div>
          <div className="mt-4">
            <TransitionActions orderId={order.id} status={order.status} />
          </div>
        </Card>
        <Card className="p-5 text-sm shadow-sm">
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
              <dd className="font-semibold text-gray-900">{formatMoney(order.totalValue)}</dd>
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
        </Card>
      </div>

      <Card className="mt-6 gap-3 py-5 shadow-sm">
        <h2 className="px-5 text-sm font-semibold text-gray-500">Items</h2>
        <Table className="min-w-[480px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-5">SKU</TableHead>
              <TableHead className="px-5">Qty</TableHead>
              <TableHead className="px-5">Unit Price</TableHead>
              <TableHead className="px-5">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((item) => (
              <TableRow key={item.id} className="hover:bg-indigo-50/50">
                <TableCell className="px-5">{item.sku}</TableCell>
                <TableCell className="px-5">{item.qty}</TableCell>
                <TableCell className="px-5">{formatMoney(item.unitPrice)}</TableCell>
                <TableCell className="px-5 font-semibold text-gray-900">
                  {formatMoney(Number(item.unitPrice) * item.qty)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
