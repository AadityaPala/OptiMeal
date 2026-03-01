// app/dashboard/page.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";

import { fetchAPI, API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2 } from "lucide-react";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Menu {
  id: string;
  location_name: string;
  image_url: string | null;
  created_at: string;
}

export interface DailyMacros {
  calories: { consumed: number; target: number };
  protein: { consumed: number; target: number };
  carbs: { consumed: number; target: number };
  fats: { consumed: number; target: number };
}

export interface BudgetSummary {
  spentToday: number;
  remainingBudget: number;
}

export interface PreferenceInsight {
  id: string;
  text: string;
}

const mockDailyMacros: DailyMacros = {
  calories: { consumed: 1500, target: 2000 },
  protein: { consumed: 90, target: 120 },
  carbs: { consumed: 160, target: 220 },
  fats: { consumed: 45, target: 70 },
};

const mockBudget: BudgetSummary = {
  spentToday: 12.5,
  remainingBudget: 7.5,
};

const mockInsights: PreferenceInsight[] = [
  {
    id: "fiber",
    text: "You are currently 10g under your average daily fiber intake.",
  },
  {
    id: "protein",
    text: "You consistently hit your protein goal on days you eat before 10am.",
  },
];

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
                  {format(new Date(menu.created_at), "MMM d, yyyy \u00B7 h:mm a")}
                </p>
              </div>
              <Badge variant="outline" className="ml-3 shrink-0 text-xs">
                View {"\u2192"}
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
              {deletingId ? "Deleting\u2026" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const router = useRouter();
  const macros = mockDailyMacros;
  const budget = mockBudget;

  const [userId, setUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
      } else {
        setUserId(user.id);
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
      <div className="container mx-auto px-4 py-8 md:py-10">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Today&apos;s Overview
            </h1>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              Your health, macros, and budget at a glance.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => router.push("/menu-upload")}
            >
              Upload Menu
            </Button>
          </div>
        </header>

        {/* Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-[2fr,1.5fr]">
          {/* Left column: Macros + Insights + Menus */}
          <div className="space-y-6">
            {/* Macro Tracker */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle>Macro Tracker</CardTitle>
                  <CardDescription>
                    How today compares to your personalized targets.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  Daily
                </Badge>
              </CardHeader>
              <CardContent className="space-y-5">
                <MacroRow
                  label="Calories"
                  unit="kcal"
                  color="bg-primary"
                  consumed={macros.calories.consumed}
                  target={macros.calories.target}
                />
                <MacroRow
                  label="Protein"
                  unit="g"
                  color="bg-emerald-500"
                  consumed={macros.protein.consumed}
                  target={macros.protein.target}
                />
                <MacroRow
                  label="Carbs"
                  unit="g"
                  color="bg-sky-500"
                  consumed={macros.carbs.consumed}
                  target={macros.carbs.target}
                />
                <MacroRow
                  label="Fats"
                  unit="g"
                  color="bg-amber-500"
                  consumed={macros.fats.consumed}
                  target={macros.fats.target}
                />
              </CardContent>
            </Card>

            {/* Historical Insights */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle>Historical Insights</CardTitle>
                <CardDescription>
                  AI-powered patterns from your past logs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {mockInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                  >
                    <span className="font-medium text-foreground">Insight:</span>{" "}
                    {insight.text}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Past Menus */}
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

          {/* Right column: Budget + extras */}
          <div className="space-y-6">
            {/* Budget Tracker */}
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle>Budget Tracker</CardTitle>
                <CardDescription>
                  Keep your wallet aligned with your health goals.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Spent Today</span>
                  <span className="font-semibold">
                    ${budget.spentToday.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Remaining Budget
                  </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    ${budget.remainingBudget.toFixed(2)}
                  </span>
                </div>
                <div className="pt-1 text-xs text-muted-foreground">
                  Stay within budget to maximize consistency and reduce friction
                  around food decisions.
                </div>
              </CardContent>
            </Card>

            {/* Next Steps */}
            <Card className="border-border/60 bg-linear-to-br from-primary/5 via-background to-muted/40 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle>Next Steps</CardTitle>
                <CardDescription>
                  Soon you&apos;ll see AI-powered meal suggestions here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Once you upload a menu, OptiMeal will analyze your{" "}
                  <span className="font-medium text-foreground">
                    macros, budget, and preferences
                  </span>{" "}
                  to recommend the best options available right now.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
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

interface MacroRowProps {
  label: string;
  unit: string;
  consumed: number;
  target: number;
  color: string;
}

function MacroRow({ label, unit, consumed, target, color }: MacroRowProps) {
  const percent = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const rounded = Math.round(percent);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {rounded}% of target
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {consumed} / {target} {unit}
        </span>
      </div>
      <div className="relative">
        <Progress value={rounded} className="h-2 overflow-hidden bg-muted" />
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 rounded-full ${color}`}
          style={{ width: `${rounded}%` }}
        />
      </div>
    </div>
  );
}
