"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
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
interface MenuItem {
  id: string;
  item_name: string;
  price: number;
  est_calories: number;
  est_protein_g: number;
  est_carbs_g: number;
  est_fats_g: number;
}

interface MenuDetail {
  id: string;
  location_name: string;
  image_url: string | null;
  created_at: string;
}

interface MenuResponse {
  menu: MenuDetail;
  items: MenuItem[];
  converted_currency?: string;
}

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
  daily_budget: number;
  recommendations: MealRecommendation[];
}

// ---------------------------------------------------------------------------
// Macro pill
// ---------------------------------------------------------------------------
function MacroPill({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className={`flex flex-col items-center rounded-lg px-2.5 py-1.5 ${color}`}>
      <span className="text-[10px] font-medium opacity-60">{label}</span>
      <span className="text-xs font-semibold">
        {value}
        <span className="text-[10px] font-normal ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommendation card (inline — mirrors the /recommendations page)
// ---------------------------------------------------------------------------
function RecommendationCard({
  rec,
  rank,
  dailyBudget,
  currencySymbol = "$",
}: {
  rec: MealRecommendation;
  rank: number;
  dailyBudget: number;
  currencySymbol?: string;
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
          <CardTitle className="text-base leading-snug">{rec.meal_name}</CardTitle>
          <Badge variant={rankInfo.variant} className="shrink-0 mt-0.5 text-xs">
            {rankInfo.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-sm font-semibold ${withinBudget ? "text-emerald-600" : "text-destructive"}`}>
            {currencySymbol}{rec.total_cost.toFixed(2)}
          </span>
          {dailyBudget > 0 && (
            <CardDescription className="text-xs">
              {withinBudget
                ? `\u2713 ${budgetPct?.toFixed(0)}% of your ${currencySymbol}${dailyBudget.toFixed(2)} budget \u2014 saves ${currencySymbol}${budgetLeft.toFixed(2)}`
                : `\u26a0 ${currencySymbol}${Math.abs(budgetLeft).toFixed(2)} over budget`}
            </CardDescription>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {rec.items_included.map((item) => (
            <Badge key={item} variant="secondary" className="text-xs font-normal">
              {item}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <MacroPill label="Calories" value={rec.total_calories} unit="kcal" color="bg-amber-50 text-amber-900" />
          <MacroPill label="Protein" value={rec.total_protein} unit="g" color="bg-sky-50 text-sky-900" />
          <MacroPill label="Carbs" value={rec.total_carbs} unit="g" color="bg-emerald-50 text-emerald-900" />
          <MacroPill label="Fats" value={rec.total_fats} unit="g" color="bg-rose-50 text-rose-900" />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{rec.reasoning}</p>
        <Button variant="outline" size="sm" disabled>
          📋 Save Meal to Daily Log
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AI section (loading skeleton + results)
// ---------------------------------------------------------------------------
function AiSection({ recs, daily_budget, currencySymbol = "$" }: { recs: MealRecommendation[]; daily_budget: number; currencySymbol?: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">AI Recommendations</h2>
        <Badge variant="secondary" className="text-xs">
          Powered by Gemini
        </Badge>
      </div>
      {recs.map((rec, i) => (
        <RecommendationCard key={i} rec={rec} rank={i} dailyBudget={daily_budget} currencySymbol={currencySymbol} />
      ))}
    </div>
  );
}

function AiLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="relative flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <span className="absolute text-lg">🤖</span>
        </div>
        <p className="text-sm font-medium">AI is crunching the numbers and analyzing macros…</p>
      </div>
      {[1, 2, 3].map((i) => (
        <Card key={i} className="border-border/60">
          <CardHeader className="pb-3">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4 mt-1" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-10 w-14 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu item table row
// ---------------------------------------------------------------------------
function ItemRow({ item }: { item: MenuItem }) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-3 pr-4 text-sm font-medium">{item.item_name}</td>
      <td className="py-3 pr-4 text-sm text-right">${item.price.toFixed(2)}</td>
      <td className="py-3 pr-4 text-sm text-right text-muted-foreground">{item.est_calories}</td>
      <td className="py-3 pr-4 text-sm text-right text-muted-foreground">{item.est_protein_g}g</td>
      <td className="py-3 pr-4 text-sm text-right text-muted-foreground">{item.est_carbs_g}g</td>
      <td className="py-3 text-sm text-right text-muted-foreground">{item.est_fats_g}g</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Currency helpers
// ---------------------------------------------------------------------------
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "\u20AC", GBP: "\u00A3", INR: "\u20B9", CAD: "CA$",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MenuDetailPage() {
  const params = useParams();
  const router = useRouter();
  const menuId = params?.menuId as string;

  const [menuData, setMenuData] = React.useState<MenuResponse | null>(null);
  const [menuLoading, setMenuLoading] = React.useState(true);
  const [menuError, setMenuError] = React.useState<string | null>(null);

  const currencySymbol =
    CURRENCY_SYMBOLS[(menuData?.converted_currency ?? "USD").toUpperCase()] ??
    (menuData?.converted_currency ?? "$");

  const [aiState, setAiState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [aiData, setAiData] = React.useState<RecommendationsResponse | null>(null);

  // Load menu + items on mount (fetch user first for currency conversion)
  React.useEffect(() => {
    if (!menuId) return;
    supabase.auth.getUser()
      .then(({ data: { user } }) => {
        const uid = user?.id ?? null;
        const url = uid ? `/api/menu/${menuId}?user_id=${uid}` : `/api/menu/${menuId}`;
        return fetchAPI<MenuResponse>(url);
      })
      .then((data) => setMenuData(data))
      .catch((err) => setMenuError(err?.message ?? "Failed to load menu."))
      .finally(() => setMenuLoading(false));
  }, [menuId]);

  const handleGetRecommendations = async () => {
    setAiState("loading");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You must be logged in.");
      router.replace("/login");
      return;
    }

    try {
      const result = await fetchAPI<RecommendationsResponse>("/api/recommendations/generate", {
        method: "POST",
        body: { user_id: user.id, menu_id: menuId },
      });
      setAiData(result);
      setAiState("done");
      // Scroll to the recommendations section smoothly
      setTimeout(() => {
        document.getElementById("ai-recommendations")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate recommendations.");
      setAiState("error");
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
      <div className="container mx-auto max-w-4xl px-4 py-10 md:py-14 space-y-8">

        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          ← Back to Dashboard
        </Button>

        {/* Header */}
        {menuLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        )}

        {menuError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="py-8 text-center">
              <p className="text-destructive font-medium">{menuError}</p>
            </CardContent>
          </Card>
        )}

        {menuData && (
          <>
            {/* Menu header + AI CTA */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {menuData.menu.location_name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Uploaded {format(new Date(menuData.menu.created_at), "MMM d, yyyy · h:mm a")} ·{" "}
                  {menuData.items.length} items
                </p>
              </div>

              {/* Prominent AI button */}
              <Button
                size="lg"
                className="shrink-0 gap-2 bg-primary text-primary-foreground shadow-md hover:shadow-lg"
                onClick={handleGetRecommendations}
                disabled={aiState === "loading" || aiState === "done"}
              >
                {aiState === "loading" ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Generating…
                  </>
                ) : aiState === "done" ? (
                  "✅ Recommendations ready"
                ) : (
                  "✨ Ask AI for Recommendations"
                )}
              </Button>
            </div>

            {/* Items table */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle>Menu Items</CardTitle>
                <CardDescription>
                  All parsed items from this upload. Use them to plan your diet manually or let AI pick the best combos.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Item</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Cal</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Protein</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Carbs</th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Fats</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30 px-2">
                    {menuData.items.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-6 py-3 text-sm font-medium">{item.item_name}</td>
                        <td className="px-4 py-3 text-sm text-right">{currencySymbol}{item.price.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">{item.est_calories}</td>
                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">{item.est_protein_g}g</td>
                        <td className="px-4 py-3 text-sm text-right text-muted-foreground">{item.est_carbs_g}g</td>
                        <td className="px-6 py-3 text-sm text-right text-muted-foreground">{item.est_fats_g}g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* AI Recommendations */}
            {(aiState === "loading" || aiState === "done" || aiState === "error") && (
              <div id="ai-recommendations">
                <Separator className="my-2" />
                {aiState === "loading" && <AiLoadingSkeleton />}
                {aiState === "done" && aiData && (
                  <AiSection recs={aiData.recommendations} daily_budget={aiData.daily_budget} currencySymbol={currencySymbol} />
                )}
                {aiState === "error" && (
                  <Card className="border-destructive/40 bg-destructive/5">
                    <CardContent className="py-6 text-center space-y-3">
                      <p className="text-destructive font-medium">
                        Could not generate recommendations. Please try again.
                      </p>
                      <Button variant="outline" size="sm" onClick={handleGetRecommendations}>
                        Retry
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
