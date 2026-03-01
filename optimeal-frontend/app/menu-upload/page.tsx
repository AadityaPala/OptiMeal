"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { API_BASE_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ParsedMenuItem {
  item_name: string;
  price: number;
  est_calories: number;
  est_protein: number;
  est_carbs: number;
  est_fats: number;
}

interface UploadResponse {
  menu_id: string;
  image_url: string;
  items: ParsedMenuItem[];
}

export default function MenuUploadPage() {
  const router = useRouter();
  const [locationName, setLocationName] = React.useState("");
  const [originalCurrency, setOriginalCurrency] = React.useState("USD");
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<ParsedMenuItem[]>([]);
  const [userId, setUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        window.location.replace("/login");
      } else {
        setUserId(user.id);
      }
    });
  }, []);

  React.useEffect(() => {
    // Cleanup object URL when component unmounts or file changes.
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    setFile(selectedFile);
    // Only create preview for image types; CSV/Excel have no visual preview
    if (selectedFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } else {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setItems([]);

    if (!userId) {
      setError("You must be logged in to upload a menu.");
      return;
    }

    if (!file) {
      setError("Please select a menu file to upload.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("user_id", userId);
      if (locationName.trim().length > 0) {
        formData.append("location_name", locationName.trim());
      }
      formData.append("original_currency", originalCurrency);
      formData.append("file", file);

      const response = await fetch(`${API_BASE_URL}/api/menu/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let message = `Upload failed with status ${response.status}`;
        try {
          const payload = await response.json();
          if (payload?.detail) {
            message = Array.isArray(payload.detail)
              ? payload.detail[0]?.msg ?? message
              : payload.detail;
          }
        } catch {
          // ignore JSON parsing error
        }
        throw new Error(message);
      }

      const data = (await response.json()) as UploadResponse;
      setItems(data.items ?? []);
      toast.success("Menu uploaded! Generating AI recommendations…");
      router.push(`/recommendations/${data.menu_id}`);
    } catch (err: any) {
      const message =
        err?.message ?? "Something went wrong while uploading the menu.";
      setError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-background via-background to-muted/40">
      <div className="container mx-auto px-4 py-8 md:py-10">
        <header className="mb-8 space-y-2 text-center md:mb-10 md:text-left">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Upload a Menu
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Snap or upload a photo of a menu and let OptiMeal estimate macros
            and prices for you.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr),minmax(0,1.2fr)]">
          {/* Upload card */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle>Menu upload</CardTitle>
              <CardDescription>
                Provide a menu image, CSV, or Excel file and optional location name. The AI or parser will do the rest.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="location_name">Location name (optional)</Label>
                  <Input
                    id="location_name"
                    type="text"
                    placeholder="e.g. Campus Dining Hall, Local Diner"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="original_currency">Menu currency</Label>
                  <Select value={originalCurrency} onValueChange={setOriginalCurrency}>
                    <SelectTrigger id="original_currency">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD &mdash; US Dollar ($)</SelectItem>
                      <SelectItem value="EUR">EUR &mdash; Euro (&euro;)</SelectItem>
                      <SelectItem value="GBP">GBP &mdash; British Pound (&pound;)</SelectItem>
                      <SelectItem value="INR">INR &mdash; Indian Rupee (&#8377;)</SelectItem>
                      <SelectItem value="CAD">CAD &mdash; Canadian Dollar (CA$)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The currency prices are listed in on this menu.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="menu_image">Menu file (image, CSV, or Excel)</Label>
                  <Input
                    id="menu_image"
                    type="file"
                    accept="image/*,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleFileChange}
                  />
                  <p className="text-xs text-muted-foreground">
                    Images (JPG, PNG, HEIC), CSV, or Excel (.xlsx, .xls). CSV/Excel should have columns: item_name, price, est_calories, est_protein, est_carbs, est_fats.
                  </p>
                </div>

                {error && (
                  <p className="text-sm font-medium text-destructive">
                    {error}
                  </p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    By uploading, you agree that the file may be processed by an AI model or parser to estimate nutritional information.
                  </p>
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={isUploading}
                  >
                    {isUploading ? "Uploading..." : "Upload & Analyze"}
                  </Button>
                </div>

                {isUploading && (
                  <div className="rounded-md border border-dashed bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                    {file?.type.startsWith("image/")
                      ? "🤖 AI is analyzing the menu..."
                      : "📊 Parsing spreadsheet..."}
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Preview and results */}
          <div className="space-y-6">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  Confirm the menu image before saving. (CSV/Excel files have no preview.)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center rounded-md border bg-muted/40 p-3">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt="Menu preview"
                      className="max-h-80 w-full rounded-md object-contain"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No image selected yet. Choose an image file to see a preview.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle>Extracted items</CardTitle>
                <CardDescription>
                  Once analyzed, menu items and estimated macros will appear
                  here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No items yet. Upload a menu and wait for the AI to finish
                    parsing.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {items.map((item) => (
                      <div
                        key={item.item_name + item.price}
                        className="flex flex-col justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm"
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{item.item_name}</p>
                            <p className="text-xs text-muted-foreground">
                              ${item.price.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                          <div>
                            <span className="font-medium text-foreground">
                              {item.est_calories}
                            </span>{" "}
                            kcal
                          </div>
                          <div>
                            <span className="font-medium text-foreground">
                              {item.est_protein}
                            </span>{" "}
                            g protein
                          </div>
                          <div>
                            <span className="font-medium text-foreground">
                              {item.est_carbs}
                            </span>{" "}
                            g carbs
                          </div>
                          <div>
                            <span className="font-medium text-foreground">
                              {item.est_fats}
                            </span>{" "}
                            g fats
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

