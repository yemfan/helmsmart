"use client";

import { Bell, ChevronDown, CreditCard, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MobileSidebar } from "./MobileSidebar";
import { ProfileMenu } from "./ProfileMenu";
import type { NavSection } from "./types";

export type PremiumTopbarAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "ghost";
  disabled?: boolean;
  className?: string;
};

export type PremiumTopbarProps = {
  appName: string;
  sections: NavSection[];
  searchPlaceholder?: string;
  /** Replaces the default search row (e.g. app-specific search form). */
  searchSlot?: ReactNode;
  /** Shown after {@link MobileSidebar}, before search. */
  leadingExtra?: ReactNode;
  /** e.g. `Credits · 42` — omit to hide the credits pill. */
  creditsLabel?: string;
  /** `href` for the bell; if omitted, renders a button (use `onNotificationClick`). */
  notificationHref?: string;
  onNotificationClick?: () => void;
  rightActions?: PremiumTopbarAction[];
  /** Replaces the default profile chip (menu content should be composed by the app). */
  profileSlot?: ReactNode;
  profileName?: string;
  profileEmail?: string;
  /**
   * Built-in profile UI: `"menu"` (default) uses {@link ProfileMenu}; `"chip"` uses the compact
   * chevron row with {@link profileHref} / {@link onProfileClick}.
   */
  profileVariant?: "menu" | "chip";
  /** Optional links for the built-in {@link ProfileMenu} (`profileVariant` `"menu"`). */
  profileProfileHref?: string;
  profileSettingsHref?: string;
  profileBillingHref?: string;
  profileBillingLabel?: string;
  onProfileLogout?: () => void;
  /** When set with built-in profile chip, wraps it in {@link Link}. */
  profileHref?: string;
  onProfileClick?: () => void;
  /** Second row under the bar (e.g. mobile-only search). */
  below?: ReactNode;
  className?: string;
};

function cn(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

function actionClasses(action: PremiumTopbarAction): string {
  const base = cn(
    "inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200",
    "disabled:cursor-not-allowed disabled:opacity-50",
    action.variant === "outline"
      ? "border border-slate-200/90 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
      : action.variant === "ghost"
        ? "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900"
        : "bg-slate-900 text-white shadow-sm shadow-slate-900/10 hover:bg-slate-800"
  );
  return cn(base, action.className);
}

function PremiumActionButton({ action }: { action: PremiumTopbarAction }) {
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

/**
 * Sticky glass top bar: {@link MobileSidebar}, premium search row, credits, notifications,
 * {@link PremiumTopbarAction} buttons, and optional {@link ProfileMenu} or legacy chip.
 */
export function PremiumTopbar({
  appName,
  sections,
  searchPlaceholder = "Search...",
  searchSlot,
  leadingExtra,
  creditsLabel,
  notificationHref,
  onNotificationClick,
  rightActions = [],
  profileSlot,
  profileName,
  profileEmail,
  profileVariant = "menu",
  profileProfileHref,
  profileSettingsHref,
  profileBillingHref,
  profileBillingLabel,
  onProfileLogout,
  profileHref,
  onProfileClick,
  below,
  className = "",
}: PremiumTopbarProps) {
  const hasBuiltInProfile = Boolean(profileName?.trim());

  const defaultProfileChip =
    hasBuiltInProfile && !profileSlot && profileVariant === "chip" ? (
      <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-800">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
          {initials(profileName ?? "User")}
        </div>
        <div className="hidden min-w-0 text-left leading-tight sm:block">
          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{profileName}</div>
          {profileEmail ? (
            <div className="max-w-[140px] truncate text-xs text-slate-500">{profileEmail}</div>
          ) : null}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
      </div>
    ) : null;

  const defaultProfileMenu =
    hasBuiltInProfile && !profileSlot && profileVariant === "menu" ? (
      <ProfileMenu
        name={profileName ?? "User"}
        email={profileEmail}
        profileHref={profileProfileHref}
        settingsHref={profileSettingsHref}
        billingHref={profileBillingHref}
        billingLabel={profileBillingLabel}
        onLogout={onProfileLogout}
      />
    ) : null;

  const profileInner = profileSlot ?? defaultProfileChip;

  let profileControl: ReactNode = null;
  if (defaultProfileMenu) {
    profileControl = defaultProfileMenu;
  } else if (profileInner) {
    if (onProfileClick) {
      profileControl = (
        <button
          type="button"
          onClick={onProfileClick}
          className="rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
        >
          {profileInner}
        </button>
      );
    } else if (profileHref) {
      profileControl = (
        <Link
          href={profileHref}
          className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
        >
          {profileInner}
        </Link>
      );
    } else {
      profileControl = <div className="rounded-2xl">{profileInner}</div>;
    }
  }

  const notificationBtn = (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 shadow-sm ring-1 ring-slate-900/[0.03] dark:ring-slate-100/10 transition hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
      <Bell className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
    </span>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur-xl backdrop-saturate-150",
        className
      )}
    >
      <div className="flex h-16 items-center gap-3 px-4 md:gap-4 md:px-6">
        <MobileSidebar appName={appName} sections={sections} />

        {leadingExtra ? <div className="hidden shrink-0 sm:block">{leadingExtra}</div> : null}

        <div className="min-w-0 flex-1">
          {searchSlot ?? (
            <div className="flex h-11 min-w-0 items-center gap-3 rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 px-4 shadow-sm ring-1 ring-slate-900/[0.02] dark:ring-slate-100/10 transition-all focus-within:border-slate-300 focus-within:bg-white focus-within:shadow-md focus-within:ring-slate-900/[0.04]">
              <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
              <input
                type="search"
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400"
              />
            </div>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {creditsLabel ? (
            <div className="inline-flex max-w-[200px] items-center gap-2 truncate rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-slate-900/[0.03] dark:ring-slate-100/10">
              <CreditCard className="h-[15px] w-[15px] shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              <span className="truncate font-medium tabular-nums tracking-tight">{creditsLabel}</span>
            </div>
          ) : null}

          {notificationHref || onNotificationClick ? (
            notificationHref ? (
              <Link
                href={notificationHref}
                className="inline-flex rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                aria-label="Notifications"
              >
                {notificationBtn}
              </Link>
            ) : (
              <button
                type="button"
                onClick={onNotificationClick}
                className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
                aria-label="Notifications"
              >
                {notificationBtn}
              </button>
            )
          ) : null}

          {rightActions.map((action, i) => (
            <PremiumActionButton key={`${action.label}-${i}`} action={action} />
          ))}

          {profileControl}
        </div>
      </div>

      {below ? (
        <div className="border-t border-slate-100/90 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/60 px-4 py-2 backdrop-blur-sm md:px-6">{below}</div>
      ) : null}
    </header>
  );
}
