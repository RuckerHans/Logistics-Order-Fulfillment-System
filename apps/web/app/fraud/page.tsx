import Link from "next/link";
import { Search, X } from "lucide-react";
import { fetchFlags, fetchFlagsByOrder } from "@/lib/api";
import { SeverityBadge } from "@/components/SeverityBadge";
import { RefreshButton } from "@/components/RefreshButton";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
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
      <PageHeader title="Fraud Flags" actions={<RefreshButton />} />

      <form className="mt-6 flex flex-wrap gap-2" action="/fraud">
        <input
          type="text"
          name="orderId"
          defaultValue={orderId ?? ""}
          placeholder="Filter by order ID"
          className="w-full min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none sm:max-w-xs"
        />
        <Button type="submit" className="bg-indigo-600 text-white shadow-sm hover:bg-indigo-700">
          <Search className="size-4" />
          Filter
        </Button>
        {orderId && (
          <Button type="button" variant="outline" render={<Link href="/fraud" />} nativeButton={false}>
            <X className="size-4" />
            Clear
          </Button>
        )}
      </form>

      {error && (
        <div className="mt-6">
          <ErrorState title="Couldn't load fraud flags" message={`Could not reach the fraud service: ${error}`} />
        </div>
      )}

      {!error && flags.length === 0 && (
        <div className="mt-6">
          <EmptyState label={orderId ? "No flags for this order." : "No fraud flags recorded."} />
        </div>
      )}

      {!error && flags.length > 0 && (
        <Card className="mt-6 gap-0 overflow-hidden py-0 shadow-sm">
          <Table className="min-w-[720px]">
            <TableHeader className="bg-gray-50">
              <TableRow className="hover:bg-gray-50">
                <TableHead className="px-4 py-3">Order</TableHead>
                <TableHead className="px-4 py-3">Rule</TableHead>
                <TableHead className="px-4 py-3">Severity</TableHead>
                <TableHead className="px-4 py-3">Reason</TableHead>
                <TableHead className="px-4 py-3">Flagged At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flags.map((flag) => (
                <TableRow key={flag.id} className="hover:bg-indigo-50/50">
                  <TableCell className="px-4 py-3 font-mono text-xs text-gray-700">
                    <Link href={`/orders/${flag.order_id}`} className="hover:underline" title={flag.order_id}>
                      {flag.order_id.slice(0, 8)}…
                    </Link>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-700">{flag.rule_name}</TableCell>
                  <TableCell className="px-4 py-3">
                    <SeverityBadge severity={flag.severity} />
                  </TableCell>
                  <TableCell className="px-4 py-3 whitespace-normal text-gray-600">{flag.reason}</TableCell>
                  <TableCell className="px-4 py-3 text-gray-500">{formatDateTime(flag.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
