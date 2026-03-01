"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

/**
 * Drop this component at the top of any page that requires authentication.
 * While auth state is loading it renders nothing (avoids flash).
 * Once resolved, unauthenticated users are redirected to /login.
 *
 * @example
 * export default function DashboardPage() {
 *   return (
 *     <>
 *       <AuthGuard />
 *       ...rest of page
 *     </>
 *   );
 * }
 */
export function AuthGuard() {
    const { user, loading } = useAuth();
    const router = useRouter();

    React.useEffect(() => {
        if (!loading && !user) {
            router.replace("/login");
        }
    }, [user, loading, router]);

    // Render a subtle full-screen loader while the session resolves to prevent
    // a flash of the protected page content.
    if (loading || !user) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <span className="text-sm text-muted-foreground">Loading…</span>
            </div>
        );
    }

    return null;
}
