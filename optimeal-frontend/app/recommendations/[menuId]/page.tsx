"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { fetchAPI } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MealRecommendation {
  meal_name: string;
  items_included: string[];
  total_cost: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
  reasoning: string;
}

interface RecommendationsResponse {
  user_id: string;
  menu_id: string;
  daily_budget: number;
  recommendations: MealRecommendation[];
}

// ---------------------------------------------------------------------------
// Macro pill component
// ---------------------------------------------------------------------------
function MacroPill({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <div className={`flex flex-col items-center rounded-lg px-3 py-2 ${color}`}>
      <span className="text-xs font-medium opacity-70">{label}</span>
      <span className="text-sm font-semibold">
        {value}
        <span className="text-xs font-normal ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function RecommendationsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="relative flex items-center justify-center">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <span className="absolute text-xl">🤖</span>
        </div>
        <p className="text-base font-medium text-foreground">
          AI is crunching the numbers and analyzing macros…
        </p>
        <p className="text-sm text-muted-foreground">
          Tailoring 3 perfect meal combinations just for you
        </p>
      </div>

      {[1, 2, 3].map((i) => (
        <Card key={i} className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-1/4 mt-1" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-12 w-16 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommendation card
// ---------------------------------------------------------------------------
function RecommendationCard({
  rec,
  rank,
  dailyBudget,
}: {
  rec: MealRecommendation;
  rank: number;
  dailyBudget: number;
}) {
  const budgetLeft = dailyBudget - rec.total_cost;
  const withinBudget = budgetLeft >= 0;
  const budgetPct = dailyBudget > 0 ? (rec.total_cost / dailyBudget) * 100 : null;

  const rankLabels: Record<number, { label: string; variant: "default" | "secondary" | "outline" }> = {
    0: { label: "🥇 Best Match", variant: "default" },
    1: { label: "🥈 Runner-up", variant: "secondary" },
    2: { label: "🥉 Alternative", variant: "outline" },
  };
  const rankInfo = rankLabels[rank] ?? { label: `Option ${rank + 1}`, variant: "outline" as const };

  return (
    <Card className="border-border/60 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-snug">{rec.meal_name}</CardTitle>
          <Badge variant={rankInfo.variant} className="shrink-0 mt-0.5">
            {rankInfo.label}
          </Badge>
        </div>

        {/* Cost vs budget */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span
            className={`text-sm font-semibold ${
              withinBudget ? "text-emerald-600" : "text-destructive"
            }`}
          >
            ${rec.total_cost.toFixed(2)}
          </span>
          {dailyBudget > 0 && (
            <CardDescription className="text-xs">
              {withinBudget
                ? `✓ ${budgetPct?.toFixed(0)}% of your $${dailyBudget.toFixed(2)} daily budget — saves $${budgetLeft.toFixed(2)}`
                : `⚠ $${Math.abs(budgetLeft).toFixed(2)} over your daily budget`}
            </CardDescription>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Items included */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Items included
          </p>
          <div className="flex flex-wrap gap-1.5">
            {rec.items_included.map((item) => (
              <Badge key={item} variant="secondary" className="text-xs font-normal">
                {item}
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* Macros */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Nutritional breakdown
          </p>
          <div className="flex flex-wrap gap-2">
            <MacroPill
              label="Calories"
              value={rec.total_calories}
              unit="kcal"
              color="bg-amber-50 text-amber-900"
            />
            <MacroPill
              label="Protein"
              value={rec.total_protein}
              unit="g"
              color="bg-sky-50 text-sky-900"
            />
            <MacroPill
              label="Carbs"
              value={rec.total_carbs}
              unit="g"
              color="bg-emerald-50 text-emerald-900"
            />
            <MacroPill
              label="Fats"
              value={rec.total_fats}
              unit="g"
              color="bg-rose-50 text-rose-900"
            />
          </div>
        </div>

        <Separator />

        {/* AI Reasoning */}
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Why this meal?
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">{rec.reasoning}</p>
        </div>

        {/* Phase 5 placeholder */}
        <Button variant="outline" className="w-full sm:w-auto" disabled>
          📋 Save Meal to Daily Log
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function RecommendationsPage() {
  const params = useParams();
  const router = useRouter();
  const menuId = params?.menuId as string;

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<RecommendationsResponse | null>(null);

  React.useEffect(() => {
    if (!menuId) return;

    (async () => {
      // 1. Get auth user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("You must be logged in to view recommendations.");
        router.replace("/login");
        return;
      }

      // 2. Fetch recommendations from backend
      try {
        const result = await fetchAPI<RecommendationsResponse>(
          "/api/recommendations/generate",
          {
            method: "POST",
            body: { user_id: user.id, menu_id: menuId },
          }
        );
        setData(result);
      } catch (err: any) {
        const message =
          err?.message ?? "Failed to generate recommendations. Please try again.";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [menuId, router]);

  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
      <div className="container mx-auto max-w-3xl px-4 py-10 md:py-14">
        {/* Header */}
        <div className="mb-8 space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Your Meal Recommendations
          </h1>
          <p className="text-sm text-muted-foreground">
            Personalized combos picked by OptiMeal AI based on your goals and budget.
          </p>
        </div>

        {/* States */}
        {loading && <RecommendationsSkeleton />}

        {error && !loading && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-8 text-center space-y-3">
              <p className="text-2xl">😕</p>
              <p className="font-medium text-destructive">{error}</p>
              <Button variant="outline" onClick={() => router.back()}>
                Go back
              </Button>
            </CardContent>
          </Card>
        )}

        {data && !loading && (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground">
              Showing {data.recommendations.length} AI-generated meal combinations for
              this menu.
            </p>
            {data.recommendations.map((rec, i) => (
              <RecommendationCard
                key={i}
                rec={rec}
                rank={i}
                dailyBudget={data.daily_budget}
              />
            ))}

            <div className="pt-2 text-center">
              <Button variant="ghost" size="sm" onClick={() => router.push("/menu-upload")}>
                ← Upload another menu
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
