"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OrdersPerHourPoint } from "@/lib/types";
import { formatHourLabel } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

// Single measure (order count) over an ordered time axis with no separate
// identity dimension -> one hue, sequential-style (per the data-viz palette:
// magnitude uses one hue, categorical hues are reserved for identity).
// Rendered as a vertical gradient (indigo -> violet) matching the app's
// brand accent, rather than a flat fill.
const GRADIENT_ID = "ordersPerHourGradient";

export function OrdersPerHourChart({ data }: { data: OrdersPerHourPoint[] }) {
  if (data.length === 0) {
    return <EmptyState label="No order activity in this window yet." />;
  }

  const chartData = data.map((d) => ({ ...d, label: formatHourLabel(d.hour) }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e1e0d9" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#898781" }}
            axisLine={{ stroke: "#c3c2b7" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#898781" }} axisLine={false} tickLine={false} width={32} />
          <Tooltip
            cursor={{ fill: "rgba(79,70,229,0.06)" }}
            contentStyle={{ borderRadius: 8, borderColor: "#e1e0d9", fontSize: 12 }}
            labelFormatter={(label) => label}
            formatter={(value) => {
              const n = Number(value);
              return [`${n} order${n === 1 ? "" : "s"}`, "Orders"];
            }}
          />
          <Bar dataKey="count" fill={`url(#${GRADIENT_ID})`} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
