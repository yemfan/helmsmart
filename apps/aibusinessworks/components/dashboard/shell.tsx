"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Container, cx } from "@/components/ui/primitives";
import { Mark } from "@/components/site/brand";

export interface NavItem {
  href: string;
  label: string;
}

export function DashboardShell({
  nav,
  title,
  subtitle,
  badge,
  isAdmin,
  children,
}: {
  nav: NavItem[];
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // Even if the network call fails, send them to the login screen.
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas-alt">
      <header className="border-b border-hairline bg-white">
        <Container width="wide">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2.5">
              <Mark size={30} />
              <span className="hidden font-display text-sm font-bold tracking-tight text-navy-900 sm:inline">
                AI Business Works
              </span>
            </Link>

            <div className="flex items-center gap-3">
              {isAdmin ? (
                <Link
                  href="/admin"
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-navy-600 hover:bg-navy-50 hover:text-navy-900"
                >
                  Admin
                </Link>
              ) : null}
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-medium text-navy-700 transition-colors hover:border-navy-300 disabled:opacity-60"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </Container>
      </header>

      <div className="border-b border-hairline bg-white">
        <Container width="wide">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Dashboard">
            {nav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== nav[0]?.href && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "shrink-0 border-b-2 px-3.5 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-navy-900 text-navy-900"
                      : "border-transparent text-navy-500 hover:border-navy-200 hover:text-navy-800",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </Container>
      </div>

      <main className="flex-1 py-8 sm:py-10">
        <Container width="wide">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {title}
              </h1>
              {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
            </div>
            {badge}
          </div>
          <div className="mt-8">{children}</div>
        </Container>
      </main>
    </div>
  );
}
