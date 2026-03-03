// app/dashboard/page.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, Trash2 } from "lucide-react";

import { fetchAPI } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MonthlySpendingChart,
  type MonthlySpendingPoint,
} from "@/components/analytics/MonthlySpendingChart";
import {
  TopItemsList,
  type TopItem,
} from "@/components/analytics/TopItemsList";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Menu {
  id: string;
  location_name: string;
  image_url: string | null;
  created_at: string;
}

interface RoutineAnalysis {
  lacking: string[];
  excess: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Trends section
// ---------------------------------------------------------------------------
function TrendsSection({ userId, currency }: { userId: string; currency: string }) {
  const currentYear = new Date().getFullYear();

  const [spending, setSpending] = React.useState<MonthlySpendingPoint[]>([]);
  const [topItems, setTopItems] = React.useState<TopItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      fetchAPI<MonthlySpendingPoint[]>(
        `/api/analytics/spending/${userId}?year=${currentYear}`
      ),
      fetchAPI<TopItem[]>(`/api/analytics/top-items/${userId}`),
    ])
      .then(([spendingData, topData]) => {
        setSpending(spendingData);
        setTopItems(topData);
      })
      .catch(() => toast.error("Could not load analytics data."))
      .finally(() => setLoading(false));
  }, [userId, currentYear]);

  return (
    <section className="mb-8">
      <h2 className="mb-4 text-xl font-semibold tracking-tight">Your Trends</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Monthly Spending */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Spending</CardTitle>
            <CardDescription>{currentYear} overview</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-52 w-full rounded-md" />
            ) : (
              <MonthlySpendingChart data={spending} currency={currency} />
            )}
          </CardContent>
        </Card>

        {/* Top Items */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Items</CardTitle>
            <CardDescription>Most ordered in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <TopItemsList items={topItems} currency={currency} />
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Menus list section
// ---------------------------------------------------------------------------
function MenusSection({ userId }: { userId: string }) {
  const router = useRouter();
  const [menus, setMenus] = React.useState<Menu[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [menuToDelete, setMenuToDelete] = React.useState<Menu | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchAPI<{ menus: Menu[] }>(`/api/menu?user_id=${userId}`)
      .then(({ menus }) => setMenus(menus))
      .catch(() => toast.error("Could not load your menus."))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleDelete = async () => {
    if (!menuToDelete) return;
    setDeletingId(menuToDelete.id);
    try {
      await fetchAPI(`/api/menu/${menuToDelete.id}?user_id=${userId}`, {
        method: "DELETE",
        noJson: true,
      });
      setMenus((prev) => prev.filter((m) => m.id !== menuToDelete.id));
      toast.success(`"${menuToDelete.location_name}" deleted.`);
    } catch {
      toast.error("Could not delete the menu. Please try again.");
    } finally {
      setDeletingId(null);
      setMenuToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (menus.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <p>No menus uploaded yet.</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => router.push("/menu-upload")}
        >
          Upload your first menu
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {menus.map((menu) => (
          <div key={menu.id} className="group flex items-center gap-2">
            <button
              onClick={() => router.push(`/menus/${menu.id}`)}
              className="flex min-w-0 flex-1 items-center justify-between rounded-lg border border-border/60 bg-card px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground group-hover:text-primary">
                  {menu.location_name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {format(new Date(menu.created_at), "MMM d, yyyy  h:mm a")}
                </p>
              </div>
              <Badge variant="outline" className="ml-3 shrink-0 text-xs">
                View 
              </Badge>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Delete menu"
              disabled={deletingId === menu.id}
              onClick={(e) => {
                e.stopPropagation();
                setMenuToDelete(menu);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog
        open={!!menuToDelete}
        onOpenChange={(open) => {
          if (!open) setMenuToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this menu?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{menuToDelete?.location_name}&rdquo; and all
              its items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={!!deletingId}
            >
              {deletingId ? "Deleting" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Analysis results display
// ---------------------------------------------------------------------------
function AnalysisResults({
  analysis,
  onUpdate,
}: {
  analysis: RoutineAnalysis;
  onUpdate: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Summary */}
      <p className="text-sm leading-relaxed text-foreground">{analysis.summary}</p>

      {/* Lacking */}
      {analysis.lacking.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Needs More Of
          </p>
          <div className="flex flex-wrap gap-2">
            {analysis.lacking.map((item, i) => (
              <Badge
                key={i}
                className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-300"
              >
                {item}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Excess */}
      {analysis.excess.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Watch Out For
          </p>
          <div className="flex flex-wrap gap-2">
            {analysis.excess.map((item, i) => (
              <Badge key={i} variant="destructive">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Button variant="outline" size="sm" onClick={onUpdate}>
        Update Routine
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const router = useRouter();

  const [userId, setUserId] = React.useState<string | null>(null);
  const [currency, setCurrency] = React.useState("USD");

  // Routine analysis state
  const [routineText, setRoutineText] = React.useState("");
  const [analysis, setAnalysis] = React.useState<RoutineAnalysis | null>(null);
  const [showTextarea, setShowTextarea] = React.useState(true);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = React.useState(true);

  // ------------------------------------------------------------------
  // Auth check + load any saved analysis from user_preferences
  // ------------------------------------------------------------------
  React.useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);

      // Load preferred currency from profile
      supabase
        .from("user_profiles")
        .select("preferred_currency")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data: profileData }) => {
          if (profileData?.preferred_currency) {
            setCurrency(profileData.preferred_currency);
          }
        });

      try {
        const { data } = await supabase
          .from("user_preferences")
          .select("historical_deficiencies")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data?.historical_deficiencies) {
          const parsed: RoutineAnalysis = JSON.parse(data.historical_deficiencies);
          if (parsed.lacking || parsed.excess || parsed.summary) {
            setAnalysis(parsed);
            setShowTextarea(false);
          }
        }
      } catch {
        // No saved analysis – show the input form
      } finally {
        setLoadingAnalysis(false);
      }
    });
  }, [router]);

  // ------------------------------------------------------------------
  // Analyze routine handler
  // ------------------------------------------------------------------
  const handleAnalyze = async () => {
    if (!routineText.trim() || !userId) return;
    setIsAnalyzing(true);
    try {
      const result = await fetchAPI<RoutineAnalysis>("/api/user/analyze-routine", {
        method: "POST",
        body: { user_id: userId, routine_description: routineText.trim() },
      });
      setAnalysis(result);
      setShowTextarea(false);
      toast.success("Analysis complete!");
    } catch {
      toast.error("Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
      <div className="container mx-auto px-4 py-8 md:py-10">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              My Dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              Understand your baseline diet and get personalized meal picks.
            </p>
          </div>
          <Button
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => router.push("/menu-upload")}
          >
            Upload Menu
          </Button>
        </header>

        {/* Trends */}
        {userId && <TrendsSection userId={userId} currency={currency} />}

        {/* Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[2fr,1.5fr]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Baseline Diet Analysis card */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle>Baseline Diet Analysis</CardTitle>
                <CardDescription>
                  Tell us what you typically eat and our AI nutritionist will
                  identify what your routine is missing or overdoing.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAnalysis ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ) : showTextarea ? (
                  <div className="space-y-4">
                    <Textarea
                      value={routineText}
                      onChange={(e) => setRoutineText(e.target.value)}
                      rows={6}
                      placeholder="Describe what you typically eat in a day (e.g., 'Breakfast: 3 eggs and toast. Lunch: Chicken wrap. Dinner: Pasta and a salad. Snacks: A protein bar...')."
                      disabled={isAnalyzing}
                    />
                    <Button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing || !routineText.trim()}
                      className="w-full sm:w-auto"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing
                        </>
                      ) : (
                        " Analyze My Routine Diet"
                      )}
                    </Button>
                  </div>
                ) : analysis ? (
                  <AnalysisResults
                    analysis={analysis}
                    onUpdate={() => {
                      setShowTextarea(true);
                      setRoutineText("");
                    }}
                  />
                ) : null}
              </CardContent>
            </Card>

            {/* Your Menus card */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle>Your Menus</CardTitle>
                <CardDescription>
                  Click any menu to view items or get AI recommendations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {userId ? (
                  <MenusSection userId={userId} />
                ) : (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <Card className="border-border/60 bg-linear-to-br from-primary/5 via-background to-muted/40 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle>How It Works</CardTitle>
                <CardDescription>Three steps to smarter eating.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    1
                  </span>
                  <p>
                    <span className="font-medium text-foreground">Describe your routine</span> —
                    Tell us what a typical day of eating looks like for you.
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    2
                  </span>
                  <p>
                    <span className="font-medium text-foreground">Get your analysis</span> —
                    Our AI nutritionist pinpoints gaps and excesses based on your goals.
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    3
                  </span>
                  <p>
                    <span className="font-medium text-foreground">Upload a menu</span> —
                    OptiMeal recommends the best meal combos from any restaurant menu
                    to fix your gaps in real time.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 w-full"
                  onClick={() => router.push("/menu-upload")}
                >
                  Upload a menu to get started
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
