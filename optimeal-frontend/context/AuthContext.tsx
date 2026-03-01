"use client";

import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthContextValue {
    user: User | null;
    session: Session | null;
    /** True while the initial session is being fetched from Supabase. */
    loading: boolean;
}

const AuthContext = React.createContext<AuthContextValue>({
    user: null,
    session: null,
    loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = React.useState<Session | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        // Fetch the current session synchronously first so there's no flash of
        // unauthenticated state on hard navigations.
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setLoading(false);
        });

        // Keep state in sync whenever the user signs in, refreshes their token,
        // or signs out from any tab.
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const value = React.useMemo(
        () => ({ user: session?.user ?? null, session, loading }),
        [session, loading]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Convenience hook — call this in any client component to get the current user.
 * @example const { user, loading } = useAuth();
 */
export function useAuth(): AuthContextValue {
    return React.useContext(AuthContext);
}
