// app/history/page.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Plus, Download, FileInput } from "lucide-react";
import { format } from "date-fns";

import { fetchAPI, API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  date: string;
  meals: MealItem[];
  cost: number;
}

interface MonthData {
  total_expenditure: number;
  days: DayLog[];
}

// hierarchy[year][month] = MonthData
type LogHierarchy = Record<string, Record<string, MonthData>>;

// ---------------------------------------------------------------------------
// Bulk Import Dialog
// ---------------------------------------------------------------------------
function BulkImportDialog({
  userId,
  onSuccess,
}: {
  userId: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [rawText, setRawText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => setRawText("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) return;
    setSubmitting(true);
    try {
      const result = await fetchAPI<{ message: string; imported_days: number; imported_items: number }>(
        "/api/logs/bulk-import",
        { method: "POST", body: { user_id: userId, raw_text: rawText.trim() } }
      );
      toast.success(result.message);
      setOpen(false);
      reset();
      onSuccess();
    } catch {
      toast.error("Bulk import failed. Please check your format and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <FileInput className="mr-2 h-4 w-4" />
          Bulk Import
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Import from Notes</DialogTitle>
          <DialogDescription>
            Paste your plain-text diary below. Each date header (e.g.{" "}
            <code className="rounded bg-muted px-1 text-xs">2025/11/01 : Saturday</code>)
            followed by item lines like{" "}
            <code className="rounded bg-muted px-1 text-xs">Mini thali : 70</code>{" "}
            will be parsed and saved automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={14}
            placeholder={`2025/11/01 : Saturday\nMini thali : 70(L)\nRajma + Jeera rice : 100(L)\n\n2025/11/02 : Sunday\nPancake : 45`}
            className="font-mono text-xs"
            disabled={submitting}
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting || !rawText.trim()}
              className="w-full"
            >
              {submitting ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Download CSV Button
// ---------------------------------------------------------------------------
function DownloadCsvButton({ userId }: { userId: string }) {
  const handleDownload = () => {
    const url = `${API_BASE_URL}/api/logs/export/${userId}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "optimeal_report.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Button variant="outline" onClick={handleDownload}>
      <Download className="mr-2 h-4 w-4" />
      Download CSV
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Add Expense Dialog
// ---------------------------------------------------------------------------
function AddExpenseDialog({
  userId,
  onSuccess,
}: {
  userId: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(new Date());
  const [calOpen, setCalOpen] = React.useState(false);
  const [itemName, setItemName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const reset = () => {
    setSelectedDate(new Date());
    setItemName("");
    setPrice("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !itemName.trim() || !price) return;
    setSubmitting(true);
    try {
      await fetchAPI("/api/logs/add", {
        method: "POST",
        body: {
          user_id: userId,
          log_date: format(selectedDate, "yyyy-MM-dd"),
          item_name: itemName.trim(),
          price: parseFloat(price),
        },
      });
      toast.success("Expense added!");
      setOpen(false);
      reset();
      onSuccess();
    } catch {
      toast.error("Failed to add expense. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Expense
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Manual Expense</DialogTitle>
          <DialogDescription>
            Log a meal or expense for any date. It will appear in your history immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Date picker */}
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { setSelectedDate(d); setCalOpen(false); }}
                  disabled={(d) => d > new Date()}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Item name */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-item-name">Item Name</Label>
            <Input
              id="exp-item-name"
              placeholder="e.g. Pancake, Coffee…"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              required
            />
          </div>

          {/* Price */}
          <div className="space-y-1.5">
            <Label htmlFor="exp-price">Price (Rs.)</Label>
            <Input
              id="exp-price"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 45"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={submitting || !itemName.trim() || !price || !selectedDate}
              className="w-full"
            >
              {submitting ? "Saving…" : "Save Expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}



export default function HistoryPage() {
  const router = useRouter();
  const [hierarchy, setHierarchy] = React.useState<LogHierarchy | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [userId, setUserId] = React.useState<string | null>(null);

  const loadData = React.useCallback(async (uid: string) => {
    try {
      const data = await fetchAPI<LogHierarchy>(`/api/logs/hierarchy/${uid}`);
      setHierarchy(data);
    } catch {
      toast.error("Could not load your meal history.");
    }
  }, []);

  // ------------------------------------------------------------------
  // Auth + initial data fetch
  // ------------------------------------------------------------------
  React.useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);
      await loadData(user.id);
      setLoading(false);
    });
  }, [router, loadData]);

  const handleExpenseAdded = React.useCallback(() => {
    if (userId) loadData(userId);
  }, [userId, loadData]);

  // ------------------------------------------------------------------
  // Derived data
  // ------------------------------------------------------------------
  const years = hierarchy ? Object.keys(hierarchy) : [];

  // ------------------------------------------------------------------
  // Loading skeleton
  // ------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <Skeleton className="h-9 w-48 mb-2" />
          <Skeleton className="h-5 w-64 mb-8" />
          <Skeleton className="h-10 w-72 mb-6" />
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!hierarchy || years.length === 0) {
    return (
      <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Meal History</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your complete food diary and monthly expenditure.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {userId && <BulkImportDialog userId={userId} onSuccess={handleExpenseAdded} />}
              {userId && <AddExpenseDialog userId={userId} onSuccess={handleExpenseAdded} />}
              {userId && <DownloadCsvButton userId={userId} />}
            </div>
          </header>
          <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
            <CalendarDays className="mb-4 h-14 w-14 text-muted-foreground/50" />
            <h2 className="text-xl font-semibold">No meal logs yet</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              You haven&apos;t logged any meals yet. Use &ldquo;Add Expense&rdquo; above to get started!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Main content
  // ------------------------------------------------------------------
  const defaultYear = years[0]; // most recent year

  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
      <div className="container mx-auto px-4 py-8 md:py-10">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Meal History
            </h1>
            <p className="mt-1 text-sm text-muted-foreground md:text-base">
              Your complete food diary and monthly expenditure at a glance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {userId && <BulkImportDialog userId={userId} onSuccess={handleExpenseAdded} />}
            {userId && <AddExpenseDialog userId={userId} onSuccess={handleExpenseAdded} />}
            {userId && <DownloadCsvButton userId={userId} />}
          </div>
        </header>

        {/* Year Tabs */}
        <Tabs defaultValue={defaultYear}>
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            {years.map((year) => (
              <TabsTrigger key={year} value={year} className="px-5 py-1.5 text-base">
                {year}
              </TabsTrigger>
            ))}
          </TabsList>

          {years.map((year) => {
            const months = Object.keys(hierarchy[year]); // already sorted desc by backend

            return (
              <TabsContent key={year} value={year}>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {months.map((monthNum) => {
                    const monthData = hierarchy[year][monthNum];
                    const monthName = MONTH_NAMES[parseInt(monthNum, 10) - 1];
                    const totalDays = monthData.days.length;

                    return (
                      <Link
                        key={monthNum}
                        href={`/history/${year}/${monthNum}`}
                        className="group focus:outline-none"
                      >
                        <Card className="h-full border-border/60 shadow-sm transition-all duration-150 hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-ring rounded-xl">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{monthName}</CardTitle>
                            <CardDescription>
                              {year} &middot; {totalDays} day
                              {totalDays !== 1 ? "s" : ""} logged
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <p className="text-2xl font-bold text-primary">
                              Rs.{" "}
                              {monthData.total_expenditure.toLocaleString("en-IN", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Total Spent
                            </p>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}
