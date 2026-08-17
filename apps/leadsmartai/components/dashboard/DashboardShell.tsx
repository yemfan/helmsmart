"use client";

import Link from "next/link";
import { ReactNode, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { CloseBossLogo } from "@/components/brand/CloseBossLogo";
import { useTranslation } from "react-i18next";
import { PremiumSidebarV2, filterNavSectionsByRole, type NavSection } from "@repo/ui";
import { translateNavSections } from "@/lib/i18n/navLabels";
import navConfig, { leadSmartNav } from "@/nav.config";
import brokerNavConfig from "@/brokerNav.config";
import TopBar from "@/components/dashboard/TopBar";
import { isAgentOrBrokerProfileRole } from "@/lib/rolePortalPaths";
import { signOutWithFullReload } from "@/lib/auth/signOutClient";

// CloseBoss brand — product and marketing site both carry it (the
// domain stays closebossai.com for now).
const APP_NAME = "CloseBoss";

function SidebarFooter() {
  const { t } = useTranslation("dashboard");
  return (
    <div className="rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-3 py-2.5 text-sm leading-snug text-white shadow-lg shadow-slate-900/25 ring-1 ring-white/10">
      <p className="font-medium text-white/95">{t("shell.upgradeTitle")}</p>
      <p className="mt-0.5 text-xs text-white/70">{t("shell.upgradeBody")}</p>
    </div>
  );
}

/**
 * Build the sidebar user card. Prefer the agent's `user_profiles.full_name`
 * (the same source the top bar uses) so the sidebar and header never disagree;
 * fall back to an email-derived label only when full_name is missing.
 */
function buildSidebarUser(
  email: string | null | undefined,
  appRole: string | null | undefined,
  fullName: string | null | undefined
) {
  if (!email) return undefined;
  const local = email.split("@")[0] ?? email;
  const emailName = local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  const name = (fullName?.trim() || emailName || email).trim();
  const initials =
    name
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    local.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() ||
    "A";
  const planLabel = appRole
    ? appRole.charAt(0).toUpperCase() + appRole.slice(1).toLowerCase()
    : undefined;
  return { name, email, initials, planLabel };
}

/**
 * Authenticated dashboard shell — `PremiumSidebarV2` (full height, stretch mode)
 * + TopBar + scrollable main. Sidebar surfaces a workspace switcher, persistent
 * ⌘K trigger, role-aware nav, and a footer user-identity card.
 */
export default function AppDashboardShell({
  email,
  appRole,
  fullName,
  avatarUrl,
  children,
  navConfigOverride,
}: {
  email: string | null | undefined;
  appRole?: string | null;
  /** `user_profiles.full_name` — single identity source shared with TopBar. */
  fullName?: string | null;
  /** `user_profiles.avatar_url` — server-provided so the avatar is SSR-stable. */
  avatarUrl?: string | null;
  children: ReactNode;
  /** Pass "broker" to use the loan broker sidebar instead of the agent sidebar. */
  navConfigOverride?: "broker" | null;
}) {
  // The nav config is authored in English; translate at render time keyed by
  // the English label, so a new nav entry keeps working (it falls back to its
  // own label) until someone adds a translation for it.
  const { t, i18n } = useTranslation("dashboard_nav");
  const { t: td } = useTranslation("dashboard");
  const navSections = useMemo(() => {
    const raw =
      navConfigOverride === "broker"
        ? brokerNavConfig.sections
        : filterNavSectionsByRole(leadSmartNav, appRole);
    return translateNavSections(raw as NavSection[], (s) => t(s, { defaultValue: s }));
    // i18n.language is a dependency in substance: `t` is stable across a
    // language change, so without it the sidebar would keep the old labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appRole, navConfigOverride, t, i18n.language]);

  const activeNavConfig = navConfigOverride === "broker" ? brokerNavConfig : navConfig;
  const showAgentBrokerPromotion = isAgentOrBrokerProfileRole(appRole);
  const sidebarUser = useMemo(
    () => buildSidebarUser(email, appRole, fullName),
    [email, appRole, fullName]
  );

  const handleLogout = useCallback(() => {
    void signOutWithFullReload("/");
  }, []);

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/70 text-slate-900">
      {/* Left: sidebar spans full height (same as PropertyTools) */}
      <PremiumSidebarV2
        appName={APP_NAME}
        sections={navSections}
        workspaceLabel={activeNavConfig.sidebarTitle ?? "Workspace"}
        // Brand lockup replaces the workspace switcher; the search row
        // is omitted (⌘K / the top-bar search cover it).
        brandHeader={
          <Link href="/dashboard" aria-label={td("shell.home")} className="flex items-center">
            <CloseBossLogo compact />
          </Link>
        }
        height="stretch"
        user={sidebarUser}
        onLogout={handleLogout}
        footer={showAgentBrokerPromotion ? <SidebarFooter /> : undefined}
      />
      {/* Right: header then scrollable content */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="shrink-0">
          <TopBar email={email} appRole={appRole} fullName={fullName} avatarUrl={avatarUrl} />
        </div>
        <main
          id="agent-portal-main"
          className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-50/60 px-4 py-6 md:px-8 md:py-8 lg:px-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export type DashboardShellProps = {
  title: string;
  subtitle: string;
  kpis: ReactNode;
  children: ReactNode;
  kpiGridClassName?: string;
  className?: string;
};

export function DashboardShell({
  title,
  subtitle,
  kpis,
  children,
  kpiGridClassName,
  className,
}: DashboardShellProps) {
  const { t } = useTranslation("dashboard");
  return (
    <div className={cn("min-h-screen bg-gradient-to-b from-slate-50 to-gray-100 p-4 md:p-6", className)}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="border-b border-gray-200/80 pb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{t("pages.oneWord.admin")}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        </div>

        <div className={cn("grid gap-4 md:grid-cols-3 xl:grid-cols-5", kpiGridClassName)}>{kpis}</div>

        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}
