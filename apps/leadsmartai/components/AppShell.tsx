"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/AuthProvider";
import { signOutWithFullReload } from "@/lib/auth/signOutClient";
import { CloseBossLogo } from "@/components/brand/CloseBossLogo";
import { getMarketingNavSections } from "@/marketing.nav.config";
import { MarketingTopNav } from "@/components/marketing/MarketingTopNav";
import { AskMaxBand } from "@/components/marketing/AskMaxBand";
import { SupportChatLauncher } from "@/components/support/CustomerSupportChat";
import Footer from "./Footer";
import FloatingCTA from "./FloatingCTA";

// CloseBoss repositioning: the product shells (auth, dashboard) brand
// as CloseBoss; the marketing chrome keeps CloseBoss until the
// domain/SEO migration.
const APP_NAME = "CloseBoss";

/** Marketing-shell user card — only renders when an auth session exists. */
function useSidebarUser() {
  const { user } = useAuth();
  return useMemo(() => {
    if (!user?.email) return undefined;
    const local = user.email.split("@")[0] ?? user.email;
    const name = local
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
    const initials = local.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "A";
    return { name: name || user.email, email: user.email, initials };
  }, [user?.email]);
}

/**
 * CloseBoss — App Router shell:
 * - Marketing / tools: top-nav-only chrome via `MarketingTopNav` (the
 *   legacy left sidebar was removed; the mobile drawer that `MarketingTopNav`
 *   embeds uses the shared `MobileSidebar` from `@repo/ui`).
 * - Dashboard + account settings use `DashboardShell` in `app/dashboard/layout.tsx` and `app/account/layout.tsx`.
 */
function isPlatformDashboardPath(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/agent/dashboard") ||
    pathname.startsWith("/support/dashboard") ||
    pathname.startsWith("/admin")
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation("web_marketing");
  const pathname = usePathname() ?? "";
  const isPublicReport = pathname.startsWith("/report/");
  const isEditorialLanding = pathname === "/landing-v3";
  const isPublicOpenHouse = pathname.startsWith("/oh/");
  // The brokerage-tier landing page (/for-brokerages) is a focused sales
  // page with its own custom header + footer. Wrapping it in the global
  // marketing PremiumSidebar (which surfaces calculators / consumer tools
  // not relevant to a brokerage owner) would dilute the pitch.
  const isForBrokerages = pathname.startsWith("/for-brokerages");
  // The sidebar redesign preview renders two sidebars side-by-side for
  // design review. Wrapping it in the marketing PremiumSidebar would
  // produce a triple-sidebar layout and obscure the comparison.
  const isSidebarPreview = pathname.startsWith("/sidebar-preview");
  const isAuthShell =
    pathname === "/agent-signup" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/onboarding" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/auth/");

  if (isPublicReport) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="fixed top-4 right-4 z-50">
          <SupportChatLauncher buttonClassName="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-600 shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/[0.04] transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40" />
        </div>
        <main className="min-h-screen">{children}</main>
      </div>
    );
  }

  if (isEditorialLanding) {
    // Editorial rebuild uses its own Fraunces/Inter-Tight aesthetic — do not
    // wrap in the Inter/SaaS shell. Per handoff §01-marketing-site: "do not
    // mix these aesthetics".
    return <div className="min-h-screen">{children}</div>;
  }

  if (isPublicOpenHouse) {
    // Public sign-in + iPad kiosk — runs bare so it can be installed as a
    // PWA and doesn't flash marketing chrome at visitors.
    return <div className="min-h-screen">{children}</div>;
  }

  if (isForBrokerages) {
    // Focused brokerage-owner sales landing — ships with its own header,
    // hero, and footer. Bare wrapper keeps the calculators/consumer-tools
    // sidebar from leaking onto a B2B sales surface.
    return <div className="min-h-screen">{children}</div>;
  }

  if (isSidebarPreview) {
    // Sidebar redesign preview renders both the current and proposed
    // sidebars inside the page. The global marketing sidebar would
    // turn the comparison into a three-sidebar mess.
    return <div className="min-h-screen">{children}</div>;
  }

  if (isAuthShell) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        {/*
         * Minimal chrome for auth pages. Previously these pages
         * rendered bare — no logo, no nav, no legal links, no way
         * back to marketing. TVR-011 / BF-039 flagged the bare
         * shell as a UX + compliance gap (CCPA / GDPR want legal
         * docs reachable at point of consent). We render only:
         *   - Logo at top, linking to home (escape hatch)
         *   - Footer with Terms / Privacy / Contact (legal escape)
         * No top nav — auth pages should stay focused on the form.
         */}
        <header className="border-b border-slate-200/80 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link
              href="/"
              className="flex min-w-0 items-center rounded-md transition hover:opacity-90"
              aria-label={t("aria.home")}
            >
              <CloseBossLogo compact />
            </Link>
            <Link
              href="/"
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              {t("link.back_to_home")}
            </Link>
          </div>
        </header>
        <div className="fixed top-16 right-4 z-50 sm:top-4">
          <SupportChatLauncher buttonClassName="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-600 shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/[0.04] transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40" />
        </div>
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-slate-200/80 bg-white py-4 text-center text-xs text-slate-500">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 sm:px-6">
            <Link href="/terms" className="hover:text-slate-900">{t("link.terms_of_service")}</Link>
            <span aria-hidden>·</span>
            <Link href="/privacy" className="hover:text-slate-900">{t("link.privacy_policy")}</Link>
            <span aria-hidden>·</span>
            <Link href="/contact" className="hover:text-slate-900">{t("link.contact")}</Link>
            <span aria-hidden className="hidden sm:inline">·</span>
            <span className="block w-full sm:inline sm:w-auto">
              © {new Date().getFullYear()} {t("footer.entity_name")}</span>
          </div>
        </footer>
      </div>
    );
  }

  /** Full-bleed role dashboards ship their own shell (sidebar + top bar). */
  if (isPlatformDashboardPath(pathname)) {
    return <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>;
  }

  return <MarketingChrome>{children}</MarketingChrome>;
}

function MarketingChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  // The homepage already leads with Max and ends with its own final CTA, so the
  // site-wide closing band would be a redundant second closing CTA there.
  const showAskMaxBand = pathname !== "/";
  const sidebarUser = useSidebarUser();
  const { t } = useTranslation("web_marketing");
  const sections = useMemo(() => getMarketingNavSections(t), [t]);
  const handleLogout = useCallback(() => {
    void signOutWithFullReload("/");
  }, []);

  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50/20 text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 dark:text-slate-100">
      <MarketingTopNav
        sections={sections}
        workspaceLabel={t("cta.menu", { defaultValue: "Menu" })}
        user={sidebarUser}
        onLogout={handleLogout}
      />
      <main id="main-content" className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-8">
        {children}
      </main>
      {showAskMaxBand && <AskMaxBand />}
      <Footer />
      <FloatingCTA />
    </div>
  );
}
