// app/history/[year]/[month]/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, UtensilsCrossed } from "lucide-react";

import { fetchAPI } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MealItem {
  item_name: string;
  price: number;
}

interface DayLog {
  date: string;       // "YYYY-MM-DD"
  meals: MealItem[];
  cost: number;
}

interface MonthData {
  total_expenditure: number;
  days: DayLog[];     // sorted ascending by backend
}

type LogHierarchy = Record<string, Record<string, MonthData>>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MonthHistoryPage() {
  const router = useRouter();
  const params = useParams<{ year: string; month: string }>();
  const year = params?.year ?? "";
  const month = params?.month ?? "";

  const monthName = MONTH_NAMES[parseInt(month, 10) - 1] ?? month;

  const [monthData, setMonthData] = React.useState<MonthData | null>(null);
  const [loading, setLoading] = React.useState(true);

  // ------------------------------------------------------------------
  // Auth + data fetch
  // ------------------------------------------------------------------
  React.useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const hierarchy = await fetchAPI<LogHierarchy>(
          `/api/logs/hierarchy/${user.id}`
        );
        const data = hierarchy?.[year]?.[month] ?? null;
        setMonthData(data);
      } catch {
        toast.error("Could not load history for this month.");
      } finally {
        setLoading(false);
      }
    });
  }, [router, year, month]);

  // ------------------------------------------------------------------
  // Loading skeleton
  // ------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <Skeleton className="h-9 w-52 mb-2" />
          <Skeleton className="h-5 w-40 mb-8" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Empty / not-found state
  // ------------------------------------------------------------------
  if (!monthData || monthData.days.length === 0) {
    return (
      <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
        <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 py-8 text-center">
          <UtensilsCrossed className="mb-4 h-14 w-14 text-muted-foreground/50" />
          <h2 className="text-xl font-semibold">
            No logs for {monthName} {year}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You have no recorded meals for this month.
          </p>
          <Button variant="outline" className="mt-6" asChild>
            <Link href="/history">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to History
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const { days, total_expenditure } = monthData;

  // ------------------------------------------------------------------
  // Main content — days are already ascending from the backend
  // ------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
      <div className="container mx-auto px-4 py-8 md:py-10">
        {/* Back button */}
        <Button variant="ghost" size="sm" className="-ml-2 mb-4 text-muted-foreground" asChild>
          <Link href="/history">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to History
          </Link>
        </Button>

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {monthName} {year}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            {days.length} day{days.length !== 1 ? "s" : ""} logged &middot;{" "}
            <span className="font-medium text-foreground">
              Monthly Total: Rs.{" "}
              {total_expenditure.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </p>
        </header>

        {/* Day timeline — ascending order (1st → last) */}
        <div className="relative space-y-4">
          {/* Vertical timeline stripe */}
          <div className="absolute left-4.5 top-2 bottom-2 w-px bg-border hidden sm:block" />

          {days.map((day) => {
            const dateObj = parseISO(day.date);
            const dayLabel = format(dateObj, "EEE, MMM d");  // "Tue, Dec 12"

            return (
              <div key={day.date} className="flex gap-4">
                {/* Timeline dot */}
                <div className="relative hidden sm:flex flex-col items-center">
                  <span className="mt-4 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary ring-2 ring-background" />
                </div>

                {/* Day card */}
                <Card className="flex-1 border-border/60 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{dayLabel}</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-1.5">
                    {day.meals.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No meal items recorded for this day.
                      </p>
                    ) : (
                      day.meals.map((meal, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-md px-2 py-1 text-sm odd:bg-muted/40"
                        >
                          <span className="font-medium">{meal.item_name}</span>
                          <span className="ml-4 shrink-0 text-muted-foreground">
                            Rs.{" "}
                            {meal.price.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      ))
                    )}

                    {day.meals.length > 0 && (
                      <>
                        <Separator className="mt-2" />
                        <div className="flex items-center justify-between px-2 pt-1 text-sm font-semibold">
                          <span>Day Total</span>
                          <span className="text-primary">
                            Rs.{" "}
                            {day.cost.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
