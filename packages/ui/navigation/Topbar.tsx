"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MobileSidebar, type MobileSidebarUser } from "./MobileSidebar";
import type { NavSection } from "./types";

export type TopbarAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "ghost";
  disabled?: boolean;
  className?: string;
};

export type TopbarProps = {
  appName: string;
  sections: NavSection[];
  searchPlaceholder?: string;
  rightActions?: TopbarAction[];
  /** Shown after {@link MobileSidebar}, before search (e.g. logo or brand). */
  leadingExtra?: ReactNode;
  /**
   * Search area between logo and actions.
   * - `undefined` — default search input
   * - `null` — no search (keeps layout; use when the brand lives in `leadingExtra`)
   * - other — custom node (e.g. alternate search UI)
   */
  searchSlot?: ReactNode | null;
  /** Extra controls on the right (icons, menus); shown after `rightActions`. */
  trailing?: ReactNode;
  /** Second row under the bar (e.g. mobile-only search). */
  below?: ReactNode;
  className?: string;
  // ── Pass-through to the internal MobileSidebar drawer ──
  /** Drawer header subtitle ("Agent portal", "Tools", etc.). */
  mobileWorkspaceLabel?: string;
  /** Renders the drawer's search trigger row; fires when tapped. */
  onMobileSearchClick?: () => void;
  /** Drawer footer user-identity card. */
  mobileUser?: MobileSidebarUser;
  /** Drawer footer logout button. Renders only with `mobileUser`. */
  onMobileLogout?: () => void;
  /** Drawer settings link. Defaults to `/dashboard/settings`. */
  mobileSettingsHref?: string;
  /** Drawer footer consumer slot above the user card. */
  mobileFooter?: ReactNode;
};

function actionClasses(action: TopbarAction): string {
  const base = [
    "inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
    action.variant === "outline"
      ? "border border-slate-200/90 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
      : action.variant === "ghost"
        ? "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900"
        : "bg-slate-900 text-white shadow-sm shadow-slate-900/10 hover:bg-slate-800",
  ].join(" ");
  return [base, action.className].filter(Boolean).join(" ");
}

function ActionButton({ action }: { action: TopbarAction }) {
  const className = actionClasses(action);

  if (action.href) {
    const h = action.href;
    if (/^https?:\/\//i.test(h)) {
      return (
        <a href={h} className={className}>
          {action.label}
        </a>
      );
    }
    return (
      <Link href={h} className={className}>
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} disabled={action.disabled} className={className}>
      {action.label}
    </button>
  );
}

/**
 * Sticky top bar with {@link MobileSidebar}, optional `leadingExtra`, search, and actions.
 */
export function Topbar({
  appName,
  sections,
  searchPlaceholder = "Search...",
  rightActions = [],
  leadingExtra,
  searchSlot,
  trailing,
  below,
  className = "",
  mobileWorkspaceLabel,
  onMobileSearchClick,
  mobileUser,
  onMobileLogout,
  mobileSettingsHref,
  mobileFooter,
}: TopbarProps) {
  return (
    <header
      className={`sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900/85 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl backdrop-saturate-150 ${className}`}
    >
      <div className="flex h-[60px] items-center gap-3 px-4 md:gap-4 md:px-6">
        <MobileSidebar
          appName={appName}
          sections={sections}
          workspaceLabel={mobileWorkspaceLabel}
          onSearchClick={onMobileSearchClick}
          user={mobileUser}
          onLogout={onMobileLogout}
          settingsHref={mobileSettingsHref}
          footer={mobileFooter}
        />

        {leadingExtra ? <div className="min-w-0 shrink-0">{leadingExtra}</div> : null}

        <div className="min-w-0 flex-1">
          {searchSlot === undefined ? (
            <div className="flex h-11 min-w-0 items-center gap-3 rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/60 px-3.5 shadow-sm transition-colors focus-within:border-slate-300 focus-within:bg-white focus-within:shadow-md md:px-4">
              <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
              <input
                type="search"
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-slate-900 dark:text-slate-100 outline-none ring-0 placeholder:text-slate-400"
              />
            </div>
          ) : searchSlot === null ? (
            <div className="min-h-[44px] min-w-0 flex-1" aria-hidden />
          ) : (
            searchSlot
          )}
        </div>

        {/*
          Keep `trailing` (profile / account menus) outside `overflow-x-auto` — otherwise
          absolutely positioned dropdowns are clipped and look like an empty menu.
        */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex max-w-[48vw] min-w-0 shrink items-center gap-2 overflow-x-auto sm:max-w-none md:max-w-none [&>*]:shrink-0">
            {rightActions.map((action, i) => (
              <ActionButton key={`${action.label}-${i}`} action={action} />
            ))}
          </div>
          {trailing ? (
            <div className="flex shrink-0 items-center gap-2 overflow-visible [&>*]:shrink-0">
              {trailing}
            </div>
          ) : null}
        </div>
      </div>

      {below ? (
        <div className="border-t border-slate-100/90 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/60 px-4 py-2.5 backdrop-blur-md md:px-6">{below}</div>
      ) : null}
    </header>
  );
}
