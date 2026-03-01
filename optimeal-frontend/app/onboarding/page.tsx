// app/onboarding/page.tsx
"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { fetchAPI } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

export type Gender = "male" | "female" | "other";
export type HealthGoal = "weight_loss" | "maintenance" | "muscle_gain";

export type DietaryPreference = "vegan" | "vegetarian" | "gluten_free" | "none";

export interface UserProfile {
  age: number;
  weightKg: number;
  heightCm: number;
  gender: Gender;
  goal: HealthGoal;
  dietaryPreferences: DietaryPreference[];
  dailyBudgetUsd: number;
}

const dietaryOptions: { label: string; value: DietaryPreference }[] = [
  { label: "Vegan", value: "vegan" },
  { label: "Vegetarian", value: "vegetarian" },
  { label: "Gluten-Free", value: "gluten_free" },
  { label: "None", value: "none" },
];

const onboardingSchema = z
  .object({
    age: z
      .number()
      .int()
      .min(13, "Minimum age is 13")
      .max(120, "Please enter a valid age"),
    weightKg: z.number().positive("Must be positive"),
    heightCm: z.number().positive("Must be positive"),
    gender: z.enum(["male", "female", "other"]),
    goal: z.enum(["weight_loss", "maintenance", "muscle_gain"]),
    dietaryPreferences: z
      .array(z.enum(["vegan", "vegetarian", "gluten_free", "none"]))
      .nonempty("Select at least one option"),
    dailyBudgetUsd: z.number().nonnegative("Must be zero or positive"),
    preferredCurrency: z.string().min(3).max(3),
  })
  .refine(
    (data) =>
      !data.dietaryPreferences.includes("none") ||
      data.dietaryPreferences.length === 1,
    {
      message: "If selecting 'None', it must be the only option.",
      path: ["dietaryPreferences"],
    }
  );

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

async function saveProfile(userId: string, values: OnboardingFormValues): Promise<void> {
  const payload = {
    user_id: userId,
    age: values.age,
    weight_kg: values.weightKg,
    height_cm: values.heightCm,
    // gender is currently stored client-side only; not yet persisted.
    goal: values.goal,
    dietary_prefs: {
      preferences: values.dietaryPreferences,
    },
    daily_budget: values.dailyBudgetUsd,
    preferred_currency: values.preferredCurrency,
  };

  // Debug log to trace payload going to the backend.
  console.log("[Onboarding] Sending profile payload", payload);

  await fetchAPI("/api/profile", {
    method: "POST",
    body: payload,
  });
}

export default function OnboardingPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      age: 21,
      weightKg: 70,
      heightCm: 175,
      gender: "other",
      goal: "maintenance",
      dietaryPreferences: ["none"],
      dailyBudgetUsd: 20,
      preferredCurrency: "USD",
    },
  });

  const onSubmit = async (values: OnboardingFormValues) => {
    console.log("[Onboarding] Form submit triggered with values", values);
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be logged in to save your profile.");
        router.replace("/login");
        return;
      }
      await saveProfile(user.id, values);
      toast.success("Profile saved. You’re all set!");
      router.push("/dashboard");
    } catch (error) {
      console.error("[Onboarding] Failed to save profile", error);
      toast.error("Could not save your profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10 md:py-16">
        <div className="mb-8 text-center md:text-left">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Complete your profile
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            Tell OptiMeal about your body, goals, and constraints so we can
            optimize every meal for you.
          </p>
        </div>

        <Card className="mx-auto max-w-3xl border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle>Onboarding</CardTitle>
            <CardDescription>
              A streamlined, multi-section form to personalize your experience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-10"
              >
                {/* Biometrics */}
                <section>
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      Biometrics
                    </h2>
                    <span className="h-px w-24 bg-border md:w-40" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="age"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={13}
                              max={120}
                              {...field}
                              onChange={(e) =>
                                field.onChange(e.target.valueAsNumber)
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            Used to better estimate your daily needs.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="weightKg"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Weight (kg)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.1"
                              {...field}
                              onChange={(e) =>
                                field.onChange(e.target.valueAsNumber)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="heightCm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Height (cm)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.5"
                              {...field}
                              onChange={(e) =>
                                field.onChange(e.target.valueAsNumber)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="mt-4 max-w-xs">
                    <FormField
                      control={form.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other / Prefer not to say</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                <Separator />

                {/* Goals */}
                <section>
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      Goals
                    </h2>
                    <span className="h-px w-24 bg-border md:w-40" />
                  </div>

                  <div className="max-w-xs">
                    <FormField
                      control={form.control}
                      name="goal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Health goal</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select goal" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="weight_loss">
                                Weight loss
                              </SelectItem>
                              <SelectItem value="maintenance">
                                Maintenance
                              </SelectItem>
                              <SelectItem value="muscle_gain">
                                Muscle gain
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            OptiMeal will tailor recommendations to this target.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                <Separator />

                {/* Constraints */}
                <section>
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      Constraints
                    </h2>
                    <span className="h-px w-24 bg-border md:w-40" />
                  </div>

                  <div className="grid gap-8 md:grid-cols-[2fr,1fr]">
                    <FormField
                      control={form.control}
                      name="dietaryPreferences"
                      render={() => (
                        <FormItem>
                          <FormLabel>Dietary preferences</FormLabel>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {dietaryOptions.map((option) => (
                              <FormField
                                key={option.value}
                                control={form.control}
                                name="dietaryPreferences"
                                render={({ field }) => {
                                  const isChecked =
                                    field.value?.includes(option.value) ??
                                    false;
                                  return (
                                    <FormItem
                                      key={option.value}
                                      className={cn(
                                        "flex flex-row items-center space-x-3 space-y-0 rounded-md border bg-muted/30 px-3 py-2",
                                        isChecked &&
                                          "border-primary/70 bg-primary/5"
                                      )}
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={isChecked}
                                          onCheckedChange={(checked) => {
                                            if (checked) {
                                              const next =
                                                option.value === "none"
                                                  ? ["none"]
                                                  : [
                                                      ...(field.value ?? []).filter(
                                                        (v) => v !== "none"
                                                      ),
                                                      option.value,
                                                    ];
                                              field.onChange(next);
                                            } else {
                                              field.onChange(
                                                (field.value ?? []).filter(
                                                  (v) => v !== option.value
                                                )
                                              );
                                            }
                                          }}
                                        />
                                      </FormControl>
                                      <div className="space-y-0.5">
                                        <span className="text-sm font-medium leading-none">
                                          {option.label}
                                        </span>
                                      </div>
                                    </FormItem>
                                  );
                                }}
                              />
                            ))}
                          </div>
                          <FormDescription>
                            These will be respected when we recommend meals.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="dailyBudgetUsd"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Daily budget</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="0.5"
                                min={0}
                                {...field}
                                onChange={(e) =>
                                  field.onChange(e.target.valueAsNumber)
                                }
                              />
                            </FormControl>
                            <FormDescription>
                              We&apos;ll keep you on track with your spending.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="preferredCurrency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Preferred currency</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select currency" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="USD">USD &mdash; US Dollar ($)</SelectItem>
                                <SelectItem value="EUR">EUR &mdash; Euro (&euro;)</SelectItem>
                                <SelectItem value="GBP">GBP &mdash; British Pound (&pound;)</SelectItem>
                                <SelectItem value="INR">INR &mdash; Indian Rupee (&#8377;)</SelectItem>
                                <SelectItem value="CAD">CAD &mdash; Canadian Dollar (CA$)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Menu prices will be converted to this currency.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </section>

                <div className="flex flex-col items-stretch gap-3 pt-4 sm:flex-row sm:items-center sm:justify-end">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Saving..." : "Save Profile"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}