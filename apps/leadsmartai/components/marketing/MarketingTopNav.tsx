"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import {
  isNavDivider,
  isNavGroup,
  isNavSectionLabel,
  MobileSidebar,
  type MobileSidebarUser,
  type NavGroupItem,
  type NavLeafItem,
  type NavSection,
} from "@repo/ui";
import HeaderAuthActions from "@/components/HeaderAuthActions";
import LanguageToggle from "@/components/LanguageToggle";
import { RealtyBossLogo, RealtyBossMark } from "@/components/brand/RealtyBossLogo";
import { SupportChatLauncher } from "@/components/support/CustomerSupportChat";

/**
 * Top-nav-first chrome for the marketing site.
 *
 * Replaces the legacy left sidebar. On desktop:
 *   - Logo (left)
 *   - Horizontal menu with dropdowns for groups, direct links for leaves
 *   - Sign in / Sign up (auth-aware) + "Start free trial" CTA on right
 *
 * On mobile (lg-) the menu collapses into the shared `MobileSidebar`
 * drawer (already implements section accordions, user card, logout).
 */
export function MarketingTopNav({
  sections,
  workspaceLabel = "Menu",
  user,
  onLogout,
}: {
  sections: NavSection[];
  workspaceLabel?: string;
  user: MobileSidebarUser | undefined;
  onLogout: () => void;
}) {
  const { t } = useTranslation("web_marketing");
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-slate-800 dark:bg-slate-950/85 dark:supports-[backdrop-filter]:bg-slate-950/70">
      {/* Header layout tuning:
       *   - Below sm (<640px): hamburger | logo (compact) | Sign in | Sign up
       *     Hide SupportChatLauncher in the bar (FloatingCTA still surfaces
       *     chat at the bottom right) and hide the "Start free trial"
       *     button to make room for Sign in / Sign up.
       *   - sm and up: also show "Start free trial" + chat launcher in
       *     the bar.
       *   - At lg and up: full horizontal nav appears in the middle. */}
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:gap-6">
        {/* Mobile hamburger + logo */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
          <div className="lg:hidden">
            <MobileSidebar
              appName="RealtyBoss"
              workspaceLabel={workspaceLabel}
              sections={sections}
              user={user}
              onLogout={user ? onLogout : undefined}
            />
          </div>
          <Link
            href="/"
            aria-label="RealtyBoss home"
            className="flex min-w-0 items-center"
          >
            {/* Mark-only below sm (375px iPhone SE leaves ~150px for the
             *  right-side actions after the hamburger + padding). */}
            <span className="sm:hidden"><RealtyBossMark className="h-7 w-7" /></span>
            <span className="hidden sm:block"><RealtyBossLogo /></span>
          </Link>
        </div>

        {/* Desktop menu (centered) */}
        <nav
          aria-label="Primary"
          className="hidden flex-1 items-center justify-center gap-1 lg:flex"
        >
          {sections.map((section, i) => (
            <NavEntry key={i} section={section} />
          ))}
        </nav>

        {/* Right-side actions */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Language toggle — hidden below sm to protect space on a 375px
              iPhone (still reachable in the mobile drawer / Settings). */}
          <LanguageToggle className="hidden sm:inline-flex" />
          <HeaderAuthActions />
          <Link
            href="/start-free"
            className="hidden items-center justify-center rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:inline-flex sm:text-sm"
          >
            {t("cta.start_free_trial", { defaultValue: "Start free trial" })}
          </Link>
          {/* Chat launcher hidden below sm — FloatingCTA still surfaces
              support chat as a separate floating button so we don't lose
              the entry point. */}
          <div className="hidden sm:block">
            <SupportChatLauncher />
          </div>
        </div>
      </div>
    </header>
  );
}

function NavEntry({ section }: { section: NavSection }) {
  if (isNavDivider(section) || isNavSectionLabel(section)) {
    return null;
  }
  if (isNavGroup(section)) {
    return <NavDropdown group={section} />;
  }
  return <NavLeaf item={section} />;
}

function NavLeaf({ item }: { item: NavLeafItem }) {
  const pathname = usePathname() ?? "";
  const isActive =
    item.match?.some((m) => pathname === m) || pathname === item.href;
  return (
    <Link
      href={item.href}
      className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 ${
        isActive
          ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      }`}
    >
      {item.label}
    </Link>
  );
}

function NavDropdown({ group }: { group: NavGroupItem }) {
  const pathname = usePathname() ?? "";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const menuId = useId();

  // Active if any child route matches the current pathname.
  const isActive = group.items.some((child) => {
    if (child.match?.some((m) => pathname === m)) return true;
    return pathname === child.href || pathname.startsWith(child.href + "/");
  });

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, [clearCloseTimer]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current) return;
      if (event.target instanceof Node && containerRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => {
        clearCloseTimer();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      className="relative"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 ${
          isActive || open
            ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        }`}
      >
        {group.label}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/[0.08] dark:border-slate-800 dark:bg-slate-900"
        >
          <ul className="p-2">
            {group.items.map((item) => {
              const childActive =
                item.match?.some((m) => pathname === m) ||
                pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={`flex items-start gap-3 rounded-xl px-3 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-1 ${
                      childActive
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                        : "text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    }`}
                  >
                    {item.icon ? (
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-slate-500 dark:text-slate-400">
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// Re-export for ergonomic imports.
export type { ReactNode };
