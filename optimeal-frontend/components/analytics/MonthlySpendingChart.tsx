// components/analytics/MonthlySpendingChart.tsx
"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

export interface MonthlySpendingPoint {
  month: string;
  spent: number;
}

interface Props {
  data: MonthlySpendingPoint[];
  /** ISO 4217 currency code – defaults to "USD" */
  currency?: string;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------
function SpendingTooltip({ active, payload, label, currency }: TooltipProps<number, string> & { currency: string }) {
  if (!active || !payload?.length) return null;

  const value = payload[0]?.value ?? 0;
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-0.5 text-muted-foreground">
        Spent: <span className="font-semibold text-foreground">{formatted}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function MonthlySpendingChart({ data, currency = "USD" }: Props) {
  const hasData = data.some((d) => d.spent > 0);

  if (!hasData) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
        No spending data for this year yet.
      </div>
    );
  }

  const yFormatter = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          className="fill-muted-foreground"
        />
        <YAxis
          tickFormatter={yFormatter}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
          className="fill-muted-foreground"
        />
        <Tooltip
          content={(props) => (
            <SpendingTooltip {...(props as TooltipProps<number, string>)} currency={currency} />
          )}
          cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "4 2" }}
        />
        <Area
          type="monotone"
          dataKey="spent"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#spendingGradient)"
          dot={false}
          activeDot={{ r: 4, stroke: "hsl(var(--primary))", strokeWidth: 2, fill: "hsl(var(--background))" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
