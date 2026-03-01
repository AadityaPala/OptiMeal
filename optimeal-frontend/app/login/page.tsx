"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const loginSchema = z.object({
    email: z.string().email("Please enter a valid email."),
    password: z.string().min(6, "Password must be at least 6 characters."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const form = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: "", password: "" },
    });

    const onSubmit = async (values: LoginFormValues) => {
        setIsSubmitting(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: values.email,
                password: values.password,
            });

            if (error) throw error;

            toast.success("Welcome back!");
            router.replace("/dashboard");
        } catch (err: any) {
            const message = err?.message ?? "Sign in failed. Please try again.";
            toast.error(message);
            form.setError("root", { message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-background via-background to-muted/40 px-4">
            <div className="w-full max-w-sm space-y-4">
                {/* Brand mark */}
                <div className="text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">OptiMeal</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Sign in to your account
                    </p>
                </div>

                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg">Welcome back</CardTitle>
                        <CardDescription>
                            Enter your email and password to continue.
                        </CardDescription>
                    </CardHeader>

                    <CardContent>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                            >
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                                <Input
                                                    id="login-email"
                                                    type="email"
                                                    autoComplete="email"
                                                    placeholder="you@example.com"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl>
                                                <Input
                                                    id="login-password"
                                                    type="password"
                                                    autoComplete="current-password"
                                                    placeholder="••••••••"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Root-level error (e.g. wrong credentials) */}
                                {form.formState.errors.root && (
                                    <p className="text-sm font-medium text-destructive">
                                        {form.formState.errors.root.message}
                                    </p>
                                )}

                                <Button
                                    id="login-submit"
                                    type="submit"
                                    className="w-full"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? "Signing in…" : "Sign In"}
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>

                <p className="text-center text-sm text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <Link
                        href="/signup"
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    );
}
