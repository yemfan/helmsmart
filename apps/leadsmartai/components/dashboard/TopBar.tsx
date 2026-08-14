"use client";

import {
  BarChart3,
  BellRing,
  Calendar,
  CreditCard,
  ChevronDown,
  House,
  ListTodo,
  LogOut,
  MessageSquare,
  Plus,
  Scale,
  Search,
  Settings,
  Sparkles,
  User,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatUserRoleLabel } from "@leadsmart/shared";
import { Topbar, filterNavSectionsByRole, type NavSection } from "@repo/ui";
import { useTranslation } from "react-i18next";
import { translateNavSections } from "@/lib/i18n/navLabels";
import { signOutWithFullReload } from "@/lib/auth/signOutClient";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { leadSmartMobileNav } from "@/nav.config";
import { CloseBossLogo, CloseBossMark } from "@/components/brand/CloseBossLogo";
import { NotificationsBell } from "@/components/dashboard/NotificationsBell";
import { CreditBalancePill } from "@/components/dashboard/CreditBalancePill";
import { SupportChatLauncher } from "@/components/support/CustomerSupportChat";
import LanguageToggle from "@/components/LanguageToggle";
import { isAdminOrSupportRole, isAgentOrBrokerProfileRole } from "@/lib/rolePortalPaths";

function displayLabelFromEmail(email: string | null | undefined): string {
  if (!email?.trim()) return "Account";
  const local = email.split("@")[0] ?? "";
  if (!local) return "Account";
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Prefer the agent's `user_profiles.full_name` for the profile button —
 * email-derived labels like "fan.yes@gmail.com" → "Fan Yes" silently
 * diverge from whatever the agent typed on their Profile page (e.g.
 * "Michael Yestest"). Fall back to the email label when full_name is
 * missing, and finally to "Account".
 */
function displayName(fullName: string | null | undefined, email: string | null | undefined): string {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed;
  return displayLabelFromEmail(email);
}

function initialsFromDisplay(display: string): string {
  return (
    display
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

/** `key` indexes `dashboard:topbar.actions.*` — the label is resolved at render. */
const QUICK_ACTION_LINKS = [
  { href: "/dashboard/leads/add", key: "addLead", Icon: UserPlus },
  { href: "/dashboard/send", key: "sendMessage", Icon: MessageSquare },
  { href: "/dashboard/tasks?new=1", key: "createTask", Icon: ListTodo },
  { href: "/dashboard/calendar?new=1", key: "createAppointment", Icon: Calendar },
  // "Generate CMA" now opens the real comps/valuation CMA; the AI
  // property-comparison report is its own action.
  { href: "/dashboard/cma", key: "generateCma", Icon: BarChart3 },
  { href: "/dashboard/comparison-report", key: "compareProperties", Icon: Scale },
] as const;

function QuickActionsDropdown() {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ top: number; right: number } | null>(null);

  const updatePlacement = useCallback(() => {
    const el = buttonRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    setPlacement({
      top: r.bottom + 8,
      right: window.innerWidth - r.right,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const menuPanel = (
    <div
      ref={menuRef}
      className="fixed z-[199] w-[min(100vw-1.5rem,17rem)] rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/[0.04]"
      role="menu"
      aria-label={t("topbar.quickActions")}
      style={
        placement
          ? { top: placement.top, right: placement.right }
          : { visibility: "hidden", pointerEvents: "none" }
      }
    >
      <Link
        href="/dashboard/boss"
        role="menuitem"
        className="mb-1 flex items-center gap-3 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-semibold text-[#0072ce] ring-1 ring-blue-100 transition hover:bg-blue-100"
        onClick={() => setOpen(false)}
      >
        <Sparkles className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        {t("topbar.askMax")}
      </Link>
      <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {t("topbar.quickActions")}
      </p>
      {QUICK_ACTION_LINKS.map(({ href, key, Icon }) => (
        <Link
          key={href}
          href={href}
          role="menuitem"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          onClick={() => setOpen(false)}
        >
          <Icon className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
          {t(`topbar.actions.${key}`)}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-3 text-slate-700 shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? t("topbar.closeQuickActions") : t("topbar.openQuickActions")}
      >
        <Plus className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden />
        <span className="hidden text-sm font-semibold sm:inline">{t("topbar.quickActions")}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {open && placement && typeof document !== "undefined" ? createPortal(menuPanel, document.body) : null}
    </div>
  );
}

function ProfileMenu({
  email,
  fullName,
  avatarUrl,
  onLogout,
  showCommercialPricing,
  slimAccountBillingOnly,
  hideAccountSettings,
  appRole,
}: {
  email: string | null | undefined;
  /** user_profiles.full_name — preferred over email-derived labels. */
  fullName?: string | null;
  avatarUrl?: string | null;
  onLogout: () => void;
  showCommercialPricing: boolean;
  /** Agent / broker: only Account + Billing (portal), same as marketing {@link AccountMenu}. */
  slimAccountBillingOnly: boolean;
  /** Admin / support: hide CRM dashboard settings entry (internal roles). */
  hideAccountSettings: boolean;
  /** `leadsmart_users.role` — shown under email. */
  appRole?: string | null;
}) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ top: number; right: number } | null>(null);

  const updatePlacement = useCallback(() => {
    const el = buttonRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    setPlacement({
      top: r.bottom + 8,
      right: window.innerWidth - r.right,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const name = displayName(fullName, email);
  const initials = initialsFromDisplay(name);

  const menuPanel = (
    <div
      ref={menuRef}
      className="fixed z-[200] w-[min(100vw-2rem,15rem)] rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/[0.04]"
      role="menu"
      style={
        placement
          ? { top: placement.top, right: placement.right }
          : { visibility: "hidden", pointerEvents: "none" }
      }
    >
      <div className="border-b border-slate-100 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t("topbar.signedIn")}</p>
        <p className="truncate text-sm font-medium text-slate-900">{name || email || t("topbar.account")}</p>
        {name && email ? (
          <p className="truncate text-xs text-slate-500">{email}</p>
        ) : null}
        <p className="mt-1 truncate text-xs text-slate-500">{t(`roles.${(appRole ?? "user").toLowerCase()}`, { defaultValue: formatUserRoleLabel(appRole) })}</p>
      </div>
      <Link
        href="/dashboard"
        className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        role="menuitem"
        onClick={() => setOpen(false)}
      >
        <House className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
        {t("topbar.home")}
      </Link>
      <Link
        href="/account/profile"
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        role="menuitem"
        onClick={() => setOpen(false)}
      >
        <User className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
        {t("topbar.myProfile")}
      </Link>
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        role="menuitem"
        onClick={() => setOpen(false)}
      >
        <Settings className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
        {t("topbar.mySettings")}
      </Link>
      <Link
        href="/dashboard/credits"
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        role="menuitem"
        onClick={() => setOpen(false)}
      >
        <CreditCard className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
        {t("topbar.creditsBilling")}
      </Link>
      <div className="mt-1 border-t border-slate-100 pt-1">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onLogout();
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {t("topbar.logOut")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 max-w-[220px] items-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-left shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-slate-300 hover:bg-slate-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 sm:gap-3 sm:px-3"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-slate-800 to-slate-900 text-xs font-bold text-white shadow-inner shadow-white/10 ring-2 ring-slate-100">
          {avatarUrl?.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL
            <img src={avatarUrl.trim()} alt="User profile photo" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </span>
        <span className="hidden min-w-0 flex-1 sm:block">
          <span className="block truncate text-sm font-semibold text-slate-900">{name || email || t("topbar.account")}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
      </button>

      {open && placement && typeof document !== "undefined"
        ? createPortal(menuPanel, document.body)
        : null}
    </div>
  );
}

export default function TopBar({
  email,
  appRole,
  fullName: fullNameProp,
  avatarUrl: avatarUrlProp,
}: {
  email: string | null | undefined;
  appRole?: string | null;
  /** Server-provided `user_profiles.full_name` — seeds state so SSR and the
   *  first client render agree (no name flicker, no hydration mismatch). */
  fullName?: string | null;
  /** Server-provided `user_profiles.avatar_url` — seeds the avatar likewise. */
  avatarUrl?: string | null;
}) {
  // Same English-keyed translation the desktop sidebar uses, so the mobile
  // drawer doesn't stay English after the agent switches language.
  const { t: tNav, i18n } = useTranslation("dashboard_nav");
  const { t } = useTranslation("dashboard");
  const navSections = useMemo(
    () =>
      translateNavSections(filterNavSectionsByRole(leadSmartMobileNav, appRole) as NavSection[], (s) =>
        tNav(s, { defaultValue: s }),
      ),
    // `t` is stable across a language change; i18n.language is what actually moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appRole, tNav, i18n.language]
  );
  const showAgentBrokerPromotion = isAgentOrBrokerProfileRole(appRole);
  const hideCommercialPricing = isAdminOrSupportRole(appRole);
  const slimAccountBillingOnly =
    isAgentOrBrokerProfileRole(appRole) && !isAdminOrSupportRole(appRole);
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(avatarUrlProp ?? null);
  const [fullName, setFullName] = useState<string | null>(fullNameProp ?? null);

  async function onLogout() {
    await signOutWithFullReload("/login");
  }

  // ── Mobile drawer wiring (PremiumSidebarV2 mirror inside MobileSidebar) ──
  const mobileDisplayName = useMemo(() => displayName(fullName, email), [fullName, email]);
  const mobileUser = useMemo(
    () =>
      email
        ? {
            name: mobileDisplayName,
            email,
            initials: initialsFromDisplay(mobileDisplayName),
            planLabel: appRole ? formatUserRoleLabel(appRole) : undefined,
          }
        : undefined,
    [email, appRole, mobileDisplayName]
  );
  const handleMobileSearch = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  }, []);
  const mobileUpgradePromo = showAgentBrokerPromotion ? (
    <Link
      href="/dashboard/credits"
      className="block rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-3 py-2.5 text-sm leading-snug text-white shadow-lg shadow-slate-900/25 ring-1 ring-white/10"
    >
      <span className="block font-medium text-white/95">{t("topbar.upsell")}</span>
      <span className="mt-0.5 block text-xs text-white/70">{t("topbar.topUp")}</span>
    </Link>
  ) : undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        const res = await fetch("/api/me", {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        // Refresh from the API to pick up profile edits made elsewhere, but
        // never overwrite the server-seeded value with an empty result (a race
        // or transient error must not blank the user's own name/avatar).
        const av = json?.avatar_url;
        if (typeof av === "string" && av.trim()) setAvatarUrl(av.trim());
        const fn = json?.full_name;
        if (typeof fn === "string" && fn.trim()) setFullName(fn.trim());
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = String(fd.get("q") ?? "").trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    router.push(`/dashboard/leads${params.toString() ? `?${params}` : ""}`);
  }

  const searchField = (inputId: string) => (
    <form
      onSubmit={onSearch}
      className="relative w-full max-w-xl min-w-0"
      role="search"
    >
      <label htmlFor={inputId} className="sr-only">
        {t("topbar.searchLeads")}
      </label>
      <div className="flex h-11 min-w-0 items-center gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-3.5 shadow-sm ring-1 ring-slate-900/[0.02] transition-all focus-within:border-slate-300 focus-within:bg-white focus-within:shadow-md focus-within:ring-slate-900/[0.04] md:px-4">
        <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
        <input
          id={inputId}
          name="q"
          type="search"
          placeholder={t("topbar.search")}
          className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
      </div>
    </form>
  );

  return (
    <Topbar
      appName="CloseBoss"
      sections={navSections}
      searchPlaceholder="Search leads, clients, addresses..."
      mobileWorkspaceLabel="Agent portal"
      onMobileSearchClick={handleMobileSearch}
      mobileUser={mobileUser}
      onMobileLogout={onLogout}
      mobileFooter={mobileUpgradePromo}
      leadingExtra={
        <Link
          href="/dashboard"
          className="flex min-w-0 shrink-0 items-center rounded-2xl p-1 outline-none transition hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-[#0072ce]/35 lg:hidden"
        >
          {/* The sidebar (lg+) carries the brand lockup, so the top bar
              only shows a logo when the sidebar is hidden: mark on
              phones (trailing actions are shrink-0 — the wordmark must
              yield at ~375px), lockup on sm–lg. */}
          <span className="sm:hidden"><CloseBossMark className="h-8 w-8" /></span>
          <span className="hidden sm:block lg:hidden"><CloseBossLogo compact className="max-w-[min(100%,220px)]" /></span>
        </Link>
      }
      searchSlot={<div className="hidden min-[480px]:block w-full">{searchField("ls-dashboard-search")}</div>}
      below={
        <div className="min-[480px]:hidden px-3 pb-3 pt-2">
          {searchField("ls-dashboard-search-mobile")}
        </div>
      }
      rightActions={[]}
      trailing={
        <>
          {/* Upgrade pill — md+ only (already hidden on small screens) */}
          {showAgentBrokerPromotion ? (
            <Link
              href="/dashboard/credits"
              className="hidden md:inline-flex h-10 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-xs font-semibold text-white shadow-md shadow-amber-500/20 transition hover:from-amber-600 hover:to-orange-600 md:text-sm"
            >
              Upgrade
            </Link>
          ) : null}

          {/*
            Secondary actions (Support, Quick Actions, Notifications) are
            hidden below md so the mobile topbar fits comfortably on a
            375px iPhone alongside the hamburger + logo + profile avatar.
            All three are still reachable from the dashboard sidebar
            drawer (via the hamburger), the ProfileMenu, and the
            in-page CTAs.
          */}
          <div className="hidden md:flex items-center gap-2">
            <CreditBalancePill />
            <LanguageToggle />
            <SupportChatLauncher />
            <QuickActionsDropdown />
            <NotificationsBell />
          </div>

          {/* Mobile-only notifications icon — kept because it's a daily-use
              quick glance, but as a single icon button (no quick-actions or
              support cluster crowding it). md+ uses the version above. */}
          <NotificationsBell className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-600 shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-slate-300 hover:bg-slate-50 md:hidden" />

          <ProfileMenu
            email={email}
            fullName={fullName}
            avatarUrl={avatarUrl}
            onLogout={onLogout}
            showCommercialPricing={!hideCommercialPricing}
            slimAccountBillingOnly={slimAccountBillingOnly}
            hideAccountSettings={hideCommercialPricing}
            appRole={appRole}
          />
        </>
      }
    />
  );
}
