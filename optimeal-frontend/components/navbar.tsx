"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { LogOut, Menu, X } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Nav links shown only when authenticated
// ---------------------------------------------------------------------------
const AUTHED_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/menu-upload", label: "Upload Menu" },
  { href: "/history", label: "History" },
] as const;

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------
export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  // Close mobile menu on route change
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success("Signed out successfully.");
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Sign out failed. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
        {/* ── Brand ── */}
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          OptiMeal
        </Link>

        {/* ── Desktop nav ── */}
        <nav className="hidden items-center gap-1 md:flex">
          {!loading && user
            ? AUTHED_LINKS.map(({ href, label }) => (
                <Button
                  key={href}
                  variant="ghost"
                  size="sm"
                  asChild
                  className={cn(
                    pathname === href && "bg-muted font-medium text-foreground"
                  )}
                >
                  <Link href={href}>{label}</Link>
                </Button>
              ))
            : !loading && (
                <>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/login">Login</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link href="/signup">Sign Up</Link>
                  </Button>
                </>
              )}
        </nav>

        {/* ── Right side: theme toggle + logout (desktop) ── */}
        <div className="flex items-center gap-2">
          <ModeToggle />

          {!loading && user && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              disabled={signingOut}
              className="hidden md:inline-flex"
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              {signingOut ? "Signing out…" : "Logout"}
            </Button>
          )}

          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="border-t bg-background px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col gap-1">
            {!loading && user
              ? AUTHED_LINKS.map(({ href, label }) => (
                  <Button
                    key={href}
                    variant="ghost"
                    size="sm"
                    asChild
                    className={cn(
                      "justify-start",
                      pathname === href && "bg-muted font-medium text-foreground"
                    )}
                  >
                    <Link href={href}>{label}</Link>
                  </Button>
                ))
              : !loading && (
                  <>
                    <Button variant="ghost" size="sm" asChild className="justify-start">
                      <Link href="/login">Login</Link>
                    </Button>
                    <Button size="sm" asChild className="justify-start">
                      <Link href="/signup">Sign Up</Link>
                    </Button>
                  </>
                )}

            {!loading && user && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                disabled={signingOut}
                className="mt-1 justify-start"
              >
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                {signingOut ? "Signing out…" : "Logout"}
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
