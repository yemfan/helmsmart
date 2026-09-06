"use client";

/**
 * Premium sidebar — v2 (proposal). Three-layer hierarchy:
 *   supercategory label  →  group row (chevron)  →  leaf row
 *
 * Visual deltas vs. `PremiumSidebar`:
 *   - Soft active fill (`bg-slate-100`) + 2px left rail in `emerald-500`
 *     (no full black pill).
 *   - Uniform lucide iconography enforced via `[&_svg]:size-*` CSS clamps.
 *   - Workspace switcher header (initials tile + chevron) replaces the
 *     flat app-name row.
 *   - Persistent Cmd-K search trigger row.
 *   - User-identity card in the footer (avatar, plan badge, settings,
 *     logout).
 *   - Three badge variants — count (digits), dot (`•`), label (any
 *     other string) — picked heuristically so existing string badges
 *     keep working.
 *
 * Drop-in shape: still consumes `NavSection[]` (the V2 type adds an
 * optional `{ kind: "section-label" }` row for supercategories).
 */

import { ChevronRight, ChevronsUpDown, LogOut, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { NavSection } from "./types";
import { isNavDivider, isNavGroup, isNavSectionLabel } from "./types";
import { isLinkActive } from "./matchPath";

/**
 * @deprecated `NavSectionLabel` is now part of the base `NavSection` union;
 * `NavSectionV2` is kept as an alias so existing callers
 * (e.g. `apps/leadsmartai/app/sidebar-preview/buildPreviewNav.tsx`) don't break.
 */
export type NavSectionV2 = NavSection;

export type PremiumSidebarV2User = {
  name: string;
  email?: string;
  /** Two-letter avatar fallback; defaults to first character of `name`. */
  initials?: string;
  /** Compact pill next to the name — "PRO", "BETA", "ADMIN", etc. */
  planLabel?: string;
};

export type PremiumSidebarV2Props = {
  appName: string;
  workspaceLabel?: string;
  /**
   * Replaces the default workspace-switcher block at the top of the
   * sidebar with custom brand content (e.g. a logo lockup linking
   * home). Omit to keep the classic switcher.
   */
  brandHeader?: ReactNode;
  sections: NavSection[];
  /** Renders the search trigger row when provided. Wire to Cmd-K. */
  onSearchClick?: () => void;
  /** Footer identity card. Omit to hide the footer. */
  user?: PremiumSidebarV2User;
  /** Footer logout button. Omit to hide. */
  onLogout?: () => void;
  /** Settings icon link (footer). */
  settingsHref?: string;
  /**
   * Arbitrary content rendered in the footer area, above the user card.
   * Typical use: an upgrade-promo banner or workspace-wide notice.
   */
  footer?: ReactNode;
  /**
   * `"viewport"` (default) → `lg:h-screen`. Use `"stretch"` when the
   * sidebar is nested inside a flex column with its own height
   * (preview pages, dashboard shells, etc.).
   */
  height?: "viewport" | "stretch";
  className?: string;
};

function cn(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

function panelIdFor(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `psv2-group-${slug || "section"}`;
}

const motion = "motion-reduce:transition-none motion-reduce:duration-0";
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white";

/** Heuristic typed badge. */
function Badge({ value, active }: { value: string; active: boolean }) {
  if (value === "•") {
    return (
      <span
        className={cn(
          "ml-auto inline-block h-1.5 w-1.5 shrink-0 rounded-full",
          active ? "bg-white" : "bg-emerald-500"
        )}
        aria-hidden
      />
    );
  }
  if (/^\d+$/.test(value)) {
    return (
      <span
        className={cn(
          "ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
          active
            ? "bg-white/15 text-white"
            : "bg-slate-200/80 text-slate-700"
        )}
      >
        {value}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        active
          ? "bg-white/15 text-white"
          : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70"
      )}
    >
      {value}
    </span>
  );
}

function ParentIconSlot({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-current [&_svg]:size-[17px]">
      {children}
    </span>
  );
}

function LeafIconSlot({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-[14px] w-[14px] shrink-0 items-center justify-center text-current [&_svg]:size-[14px]">
      {children}
    </span>
  );
}

export function PremiumSidebarV2({
  appName,
  workspaceLabel = "Workspace",
  brandHeader,
  sections,
  onSearchClick,
  user,
  onLogout,
  settingsHref = "/dashboard/settings",
  footer,
  height = "viewport",
  className,
}: PremiumSidebarV2Props) {
  const pathname = usePathname() ?? "";

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const s of sections) {
      if (!isNavSectionLabel(s) && isNavGroup(s) && s.defaultOpen) {
        initial[s.label] = true;
      }
    }
    return initial;
  });

  const lastAutoExpandPath = useRef<string | null>(null);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  useLayoutEffect(() => {
    if (lastAutoExpandPath.current === pathname) return;
    lastAutoExpandPath.current = pathname;
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const s of sectionsRef.current) {
        if (!isNavSectionLabel(s) && isNavGroup(s)) {
          if (s.items.some((item) => isLinkActive(pathname, item))) {
            next[s.label] = true;
          }
        }
      }
      return next;
    });
  }, [pathname]);

  const initial = appName.trim().charAt(0).toUpperCase() || "A";
  const useStretch = height === "stretch";

  return (
    <aside
      aria-label={appName}
      className={cn(
        "hidden lg:flex lg:w-[268px] lg:shrink-0 lg:flex-col lg:overflow-hidden",
        useStretch ? "lg:h-full lg:min-h-0" : "lg:h-screen",
        "border-r border-slate-200/80 bg-slate-50/60 backdrop-blur-sm",
        "shadow-[1px_0_0_rgba(15,23,42,0.03)]",
        className
      )}
    >
      {/* Brand header (when provided) or the classic workspace switcher */}
      {brandHeader ? (
        <div className="shrink-0 border-b border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-3 py-3">
          {brandHeader}
        </div>
      ) : (
      <button
        type="button"
        aria-label={`${appName} workspace switcher`}
        className={cn(
          "group flex shrink-0 items-center gap-2.5 border-b border-slate-200/80 bg-white/60 px-3 py-3 text-left transition",
          "hover:bg-white",
          motion,
          focusRing
        )}
      >
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 text-[13px] font-bold text-white",
            "shadow-sm shadow-slate-900/10 ring-1 ring-inset ring-white/10"
          )}
          aria-hidden
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {appName}
          </div>
          <div className="truncate text-[11px] font-medium text-slate-500">
            {workspaceLabel}
          </div>
        </div>
        <ChevronsUpDown
          className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:text-slate-600"
          strokeWidth={2.5}
          aria-hidden
        />
      </button>
      )}

      {/* Search trigger */}
      {onSearchClick ? (
        <button
          type="button"
          onClick={onSearchClick}
          className={cn(
            "group flex shrink-0 items-center gap-2.5 border-b border-slate-200/80 bg-white/40 px-3 py-2.5 text-left transition",
            "hover:bg-white/80",
            motion,
            focusRing
          )}
        >
          <Search
            className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-slate-600"
            strokeWidth={2}
            aria-hidden
          />
          <span className="flex-1 truncate text-[13px] text-slate-500">
            Search or jump to…
          </span>
          <kbd className="shrink-0 rounded border border-slate-300/80 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm">
            ⌘K
          </kbd>
        </button>
      ) : null}

      {/* Nav */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2.5 py-3 [scrollbar-gutter:stable] [scrollbar-color:rgba(148,163,184,0.5)_transparent]">
        <nav className="space-y-px">
          {sections.map((section, idx) => {
            if (isNavSectionLabel(section)) {
              return (
                <div
                  key={`label-${idx}-${section.label}`}
                  className={cn(
                    "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400",
                    idx === 0 ? "pt-1" : "pt-4"
                  )}
                  role="presentation"
                >
                  {section.label}
                </div>
              );
            }

            if (isNavDivider(section)) {
              return (
                <div
                  key={`div-${idx}`}
                  className="my-2 border-t border-slate-200/70 dark:border-slate-700"
                  role="separator"
                  aria-hidden
                />
              );
            }

            if (!isNavGroup(section)) {
              const active = isLinkActive(pathname, section);
              return (
                <Link
                  key={`${section.href}::${section.label}`}
                  href={section.href}
                  prefetch={section.prefetch === false ? false : undefined}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 transition",
                    motion,
                    focusRing,
                    active
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
                  )}
                >
                  {active ? (
                    <span
                      className="absolute left-0.5 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-emerald-500"
                      aria-hidden
                    />
                  ) : null}
                  <ParentIconSlot>
                    {section.icon ?? (
                      <span className="block h-1.5 w-1.5 rounded-full bg-current opacity-30" />
                    )}
                  </ParentIconSlot>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium tracking-[-0.005em]">
                    {section.label}
                  </span>
                  {section.badge ? (
                    <Badge value={section.badge} active={active} />
                  ) : null}
                </Link>
              );
            }

            const isOpen = openGroups[section.label] ?? false;
            const hasActiveChild = section.items.some((item) =>
              isLinkActive(pathname, item)
            );
            const groupPanelId = panelIdFor(section.label);

            return (
              <div key={section.label} className="space-y-px">
                <button
                  type="button"
                  id={`${groupPanelId}-trigger`}
                  aria-expanded={isOpen}
                  aria-controls={groupPanelId}
                  aria-label={isOpen ? `Collapse ${section.label}` : `Expand ${section.label}`}
                  onClick={() =>
                    setOpenGroups((prev) => ({
                      ...prev,
                      [section.label]: !(prev[section.label] ?? false),
                    }))
                  }
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition",
                    motion,
                    focusRing,
                    hasActiveChild
                      ? "text-slate-900"
                      : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900"
                  )}
                >
                  <ParentIconSlot>
                    {section.icon ?? (
                      <span className="block h-1.5 w-1.5 rounded-full bg-current opacity-30" />
                    )}
                  </ParentIconSlot>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.005em]">
                    {section.label}
                  </span>
                  {section.badge ? (
                    <Badge value={section.badge} active={false} />
                  ) : null}
                  <ChevronRight
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200",
                      isOpen && "rotate-90",
                      motion
                    )}
                    strokeWidth={2.5}
                    aria-hidden
                  />
                </button>

                <div
                  id={groupPanelId}
                  role="region"
                  aria-labelledby={`${groupPanelId}-trigger`}
                  className={cn(
                    "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
                    motion,
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="min-h-0">
                    <div className="space-y-px pt-px">
                      {section.items.map((item) => {
                        const active = isLinkActive(pathname, item);
                        return (
                          <Link
                            key={`${item.href}::${item.label}`}
                            href={item.href}
                            prefetch={item.prefetch === false ? false : undefined}
                            className={cn(
                              "group relative flex items-center gap-2.5 rounded-lg py-1.5 pl-9 pr-3 transition",
                              motion,
                              focusRing,
                              active
                                ? "bg-slate-100 text-slate-900"
                                : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-900"
                            )}
                          >
                            {active ? (
                              <span
                                className="absolute left-0.5 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-emerald-500"
                                aria-hidden
                              />
                            ) : null}
                            <span className="absolute left-[18px] top-1/2 -translate-y-1/2">
                              <LeafIconSlot>
                                {item.icon ?? (
                                  <span className="block h-1 w-1 rounded-full bg-current opacity-40" />
                                )}
                              </LeafIconSlot>
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13px]">
                              {item.label}
                            </span>
                            {item.badge ? (
                              <Badge value={item.badge} active={active} />
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer — optional consumer slot above the user card */}
      {footer || user ? (
        <div className="shrink-0 border-t border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900/70 p-2 backdrop-blur-sm">
          {footer ? <div className="mb-2">{footer}</div> : null}
          {user ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-white dark:bg-slate-900 px-2 py-2 ring-1 ring-slate-200/80">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-[11px] font-bold text-white shadow-sm ring-1 ring-inset ring-white/15"
              aria-hidden
            >
              {(user.initials ?? user.name.charAt(0)).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-semibold text-slate-900 dark:text-slate-100">
                  {user.name}
                </span>
                {user.planLabel ? (
                  <span className="shrink-0 rounded bg-emerald-50 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
                    {user.planLabel}
                  </span>
                ) : null}
              </div>
              {user.email ? (
                <div className="truncate text-[11px] text-slate-500">
                  {user.email}
                </div>
              ) : null}
            </div>
            <Link
              href={settingsHref}
              aria-label="Settings"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700",
                focusRing
              )}
            >
              <Settings className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </Link>
            {onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                aria-label="Log out"
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700",
                  focusRing
                )}
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
