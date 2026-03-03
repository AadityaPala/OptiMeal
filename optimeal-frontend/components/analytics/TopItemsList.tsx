// components/analytics/TopItemsList.tsx
"use client";

import * as React from "react";
import { UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface TopItem {
  item_name: string;
  count: number;
  total_spent: number;
}

interface Props {
  items: TopItem[];
  /** ISO 4217 currency code – defaults to "USD" */
  currency?: string;
}

const RANK_COLORS: string[] = [
  "bg-yellow-400/20 text-yellow-700 dark:text-yellow-300",
  "bg-slate-300/30 text-slate-600 dark:text-slate-300",
  "bg-orange-300/20 text-orange-700 dark:text-orange-300",
  "bg-muted text-muted-foreground",
  "bg-muted text-muted-foreground",
];

export function TopItemsList({ items, currency = "USD" }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No meal data found for the last 30 days.
      </div>
    );
  }

  const fmtCurrency = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);

  return (
    <ol className="space-y-2">
      {items.map((item, idx) => (
        <li
          key={item.item_name}
          className="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5 shadow-xs"
        >
          {/* Rank badge */}
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${RANK_COLORS[idx] ?? RANK_COLORS[4]}`}
          >
            {idx + 1}
          </span>

          {/* Icon */}
          <UtensilsCrossed className="h-4 w-4 shrink-0 text-muted-foreground" />

          {/* Name */}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {item.item_name}
          </span>

          {/* Stats */}
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="text-xs tabular-nums">
              ×{item.count}
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {fmtCurrency(item.total_spent)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
