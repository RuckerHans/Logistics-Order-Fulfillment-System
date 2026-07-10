"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimeInStatusPoint } from "@/lib/types";
import { STATUS_STYLE } from "@/lib/statusStyles";
import { formatDuration } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

// Here the x-axis categories (statuses) already carry an identity elsewhere
// in the app (the StatusBadge dots) -- reusing those exact colors keeps
// "the entity's color" consistent app-wide instead of introducing a second,
// unrelated color coding for the same statuses.
export function TimeInStatusChart({ data }: { data: TimeInStatusPoint[] }) {
  if (data.length === 0) {
    return <EmptyState label="No status transitions recorded yet." />;
  }

  const chartData = data.map((d) => ({
    ...d,
    label: STATUS_STYLE[d.status]?.label ?? d.status,
    color: STATUS_STYLE[d.status]?.dot ?? "#2a78d6",
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e1e0d9" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
          <YAxis
            tickFormatter={(v: number) => formatDuration(v)}
            tick={{ fontSize: 12, fill: "#898781" }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: "rgba(11,11,11,0.04)" }}
            contentStyle={{ borderRadius: 8, borderColor: "#e1e0d9", fontSize: 12 }}
            formatter={(value, _name, entry) => {
              const sampleSize = (entry?.payload as { sampleSize?: number } | undefined)?.sampleSize ?? 0;
              return [formatDuration(Number(value)), `avg (${sampleSize} sample${sampleSize === 1 ? "" : "s"})`];
            }}
          />
          <Bar dataKey="avgSeconds" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {chartData.map((d) => (
              <Cell key={d.status} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
