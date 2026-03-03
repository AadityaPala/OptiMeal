"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { LogOut, Menu, LayoutDashboard, UploadCloud, History } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Nav links shown only when authenticated
// ---------------------------------------------------------------------------
const AUTHED_LINKS = [
  { href: "/dashboard",   label: "Dashboard",   Icon: LayoutDashboard },
  { href: "/menu-upload", label: "Upload Menu",  Icon: UploadCloud },
  { href: "/history",     label: "History",      Icon: History },
] as const;

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------
export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  // Close Sheet on route change
  React.useEffect(() => {
    setSheetOpen(false);
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
      setSheetOpen(false);
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

        {/* ── Right side: theme toggle + logout (desktop) + hamburger (mobile) ── */}
        <div className="flex items-center gap-2">
          <ModeToggle />

          {/* Desktop logout */}
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

          {/* ── Mobile hamburger → Sheet ── */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="flex w-72 flex-col p-0">
              {/* Sheet header */}
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle className="text-left text-base font-semibold">
                  OptiMeal
                </SheetTitle>
              </SheetHeader>

              {/* Navigation links */}
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
                {!loading && user ? (
                  <>
                    {AUTHED_LINKS.map(({ href, label, Icon }) => (
                      <Button
                        key={href}
                        variant="ghost"
                        size="sm"
                        asChild
                        className={cn(
                          "h-10 justify-start gap-3 px-3 text-sm",
                          pathname === href &&
                            "bg-muted font-medium text-foreground"
                        )}
                      >
                        <Link href={href}>
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {label}
                        </Link>
                      </Button>
                    ))}

                    <Separator className="my-2" />

                    {/* Logout inside sheet */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                      disabled={signingOut}
                      className="h-10 justify-start gap-3 px-3 text-sm text-destructive hover:text-destructive"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      {signingOut ? "Signing out…" : "Logout"}
                    </Button>
                  </>
                ) : (
                  !loading && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-10 justify-start px-3 text-sm"
                      >
                        <Link href="/login">Login</Link>
                      </Button>
                      <Button
                        size="sm"
                        asChild
                        className="h-10 justify-start px-3 text-sm"
                      >
                        <Link href="/signup">Sign Up</Link>
                      </Button>
                    </>
                  )
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

