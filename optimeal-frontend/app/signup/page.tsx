"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { fetchAPI } from "@/lib/api";
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

const signupSchema = z
    .object({
        fullName: z
            .string()
            .min(2, "Full name must be at least 2 characters.")
            .max(100),
        email: z.string().email("Please enter a valid email."),
        password: z
            .string()
            .min(8, "Password must be at least 8 characters.")
            .max(72),
        confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match.",
        path: ["confirmPassword"],
    });

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const form = useForm<SignupFormValues>({
        resolver: zodResolver(signupSchema),
        defaultValues: { fullName: "", email: "", password: "", confirmPassword: "" },
    });

    const onSubmit = async (values: SignupFormValues) => {
        setIsSubmitting(true);
        try {
            // 1. Create the auth user + public.users row via the backend.
            //    The backend uses the service role key so no confirmation email
            //    is ever sent, avoiding Supabase's email rate limit entirely.
            await fetchAPI("/api/auth/signup", {
                method: "POST",
                body: {
                    email: values.email,
                    password: values.password,
                    full_name: values.fullName,
                },
            });

            // 2. Sign the user in locally so Supabase session cookies are set.
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: values.email,
                password: values.password,
            });
            if (signInError) throw signInError;

            toast.success("Account created! Let's set up your profile.");
            router.replace("/onboarding");
        } catch (err: any) {
            const message = err?.message ?? "Sign up failed. Please try again.";
            toast.error(message);
            form.setError("root", { message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-background via-background to-muted/40 px-4 py-10">
            <div className="w-full max-w-sm space-y-4">
                {/* Brand mark */}
                <div className="text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">OptiMeal</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Create your account
                    </p>
                </div>

                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg">Get started</CardTitle>
                        <CardDescription>
                            Fill in your details to create an account.
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
                                    name="fullName"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Full name</FormLabel>
                                            <FormControl>
                                                <Input
                                                    id="signup-fullname"
                                                    type="text"
                                                    autoComplete="name"
                                                    placeholder="Alex Johnson"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                                <Input
                                                    id="signup-email"
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
                                                    id="signup-password"
                                                    type="password"
                                                    autoComplete="new-password"
                                                    placeholder="Min. 8 characters"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="confirmPassword"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Confirm password</FormLabel>
                                            <FormControl>
                                                <Input
                                                    id="signup-confirm-password"
                                                    type="password"
                                                    autoComplete="new-password"
                                                    placeholder="••••••••"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Root-level error */}
                                {form.formState.errors.root && (
                                    <p className="text-sm font-medium text-destructive">
                                        {form.formState.errors.root.message}
                                    </p>
                                )}

                                <Button
                                    id="signup-submit"
                                    type="submit"
                                    className="w-full"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? "Creating account…" : "Create Account"}
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>

                <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link
                        href="/login"
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
