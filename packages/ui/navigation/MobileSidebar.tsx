"use client";

/**
 * Mobile drawer — V2 design language matching `PremiumSidebarV2` (desktop).
 *
 * - Workspace header (initials tile + app name + workspace label + close X).
 * - Optional ⌘K-style search trigger row inside the drawer.
 * - Soft active state (`bg-slate-100` + 2px emerald left rail) — replaces
 *   the legacy `text-[#0072ce]` ink.
 * - Uniform lucide iconography: 17px parent rows, 15px leaf rows.
 * - Supercategory bands handled (renders `NavSectionLabel` as a small
 *   uppercase rule).
 * - Typed badges shared with `PremiumSidebarV2` (count / dot / label).
 * - Footer user-identity card (settings + logout) and an optional
 *   `footer` ReactNode slot above it.
 *
 * Renders only below `lg`. Portaled to `document.body` so it escapes
 * any backdrop-filter ancestor — iOS Safari bug; see the inline note.
 */

import { ChevronDown, LogOut, Menu, Search, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { NavSection } from "./types";
import { isNavDivider, isNavGroup, isNavSectionLabel } from "./types";
import { isLinkActive } from "./matchPath";

function cn(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

const motion = "motion-reduce:transition-none motion-reduce:duration-0";
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white";

export type MobileSidebarUser = {
  name: string;
  email?: string;
  /** Two-letter avatar fallback; defaults to first character of `name`. */
  initials?: string;
  /** Compact pill next to the name — "PRO", "BETA", "ADMIN", etc. */
  planLabel?: string;
};

export type MobileSidebarProps = {
  appName: string;
  sections: NavSection[];
  /** Tag shown under app name in the drawer header (e.g. "Agent portal"). */
  workspaceLabel?: string;
  /** Renders the search trigger row when provided. Drawer auto-closes on tap. */
  onSearchClick?: () => void;
  /** Footer identity card. Omit to hide. */
  user?: MobileSidebarUser;
  /** Footer logout button. Renders only when `user` is also provided. */
  onLogout?: () => void;
  /** Settings icon link (footer). */
  settingsHref?: string;
  /** Arbitrary consumer slot above the user card (e.g. upgrade promo). */
  footer?: ReactNode;
  className?: string;
};

/** Typed badge — count (digits) / dot (`•`) / label (other text). */
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
          active ? "bg-white/15 text-white" : "bg-slate-200/80 text-slate-700"
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

export function MobileSidebar({
  appName,
  sections,
  workspaceLabel,
  onSearchClick,
  user,
  onLogout,
  settingsHref = "/dashboard/settings",
  footer,
  className = "",
}: MobileSidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const s of sections) {
      if (isNavGroup(s) && s.defaultOpen) initial[s.label] = true;
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
        if (isNavGroup(s)) {
          if (s.items.some((item) => isLinkActive(pathname, item))) {
            next[s.label] = true;
          }
        }
      }
      return next;
    });
  }, [pathname]);

  /**
   * Body scroll lock while the drawer is open. Uses `position: fixed` +
   * captured scroll offset rather than `overflow: hidden` because iOS
   * Safari ignores `overflow: hidden` on <body> for touch scrolling — the
   * background page would still scroll under the open drawer otherwise,
   * which is the most common "the hamburger is broken on iPhone" symptom.
   * Scroll position is captured before the lock and restored on close.
   */
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const titleInitial = appName.trim().charAt(0).toUpperCase() || "A";

  /**
   * Portal target: `document.body`. The drawer is portaled out of the
   * `<header>` so it escapes any ancestor `backdrop-filter` (CSS spec:
   * `backdrop-filter` makes the element the containing block for any
   * descendant `position: fixed`, which would otherwise re-anchor our
   * full-screen modal to the 60px topbar — the most common "hamburger
   * only shows one item" symptom on iOS Safari).
   */

  return (
    <>
      {/* Hamburger trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 lg:hidden",
          motion,
          className
        )}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
      >
        <Menu className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[60] lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <button
                type="button"
                className={cn(
                  "absolute inset-0 bg-slate-900/40 backdrop-blur-[3px] transition-opacity duration-200",
                  motion
                )}
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <div
                id="mobile-nav-panel"
                className={cn(
                  "absolute inset-y-0 left-0 flex w-[86%] min-w-0 max-w-[320px] flex-col overflow-hidden border-r border-slate-200/80 bg-slate-50/95 shadow-[8px_0_48px_-12px_rgba(15,23,42,0.25)] backdrop-blur-md",
                  motion
                )}
                style={{
                  minHeight: "100dvh",
                }}
              >
                {/* Workspace header */}
                <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 text-[13px] font-bold text-white",
                      "shadow-sm shadow-slate-900/10 ring-1 ring-inset ring-white/10"
                    )}
                    aria-hidden
                  >
                    {titleInitial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                      {appName}
                    </div>
                    {workspaceLabel ? (
                      <div className="truncate text-[11px] font-medium text-slate-500">
                        {workspaceLabel}
                      </div>
                    ) : (
                      <div className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                        Menu
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900",
                      motion,
                      focusRing
                    )}
                  >
                    <X
                      className="h-[18px] w-[18px]"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                </div>

                {/* Search trigger */}
                {onSearchClick ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSearchClick();
                    }}
                    className={cn(
                      "flex shrink-0 items-center gap-2.5 border-b border-slate-200/80 bg-white/60 px-3 py-3 text-left transition active:bg-white/90",
                      motion,
                      focusRing
                    )}
                  >
                    <Search
                      className="h-4 w-4 shrink-0 text-slate-400"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="flex-1 truncate text-[13px] text-slate-500">
                      Search or jump to…
                    </span>
                  </button>
                ) : null}

                {/* Nav */}
                <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2.5 py-3 [scrollbar-gutter:stable]">
                  <div className="space-y-px">
                    {sections.map((section, sectionIdx) => {
                      if (isNavDivider(section)) {
                        return (
                          <div
                            key={`nav-divider-${sectionIdx}`}
                            className="my-2 border-t border-slate-200/70 dark:border-slate-700"
                            role="separator"
                            aria-hidden
                          />
                        );
                      }
                      if (isNavSectionLabel(section)) {
                        return (
                          <div
                            key={`section-label-${sectionIdx}-${section.label}`}
                            className={cn(
                              "px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400",
                              sectionIdx === 0 ? "pt-1" : "pt-4"
                            )}
                            role="presentation"
                          >
                            {section.label}
                          </div>
                        );
                      }
                      if (!isNavGroup(section)) {
                        const active = isLinkActive(pathname, section);
                        return (
                          <Link
                            key={`${section.href}-${section.label}`}
                            href={section.href}
                            prefetch={section.prefetch === false ? false : undefined}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition",
                              motion,
                              focusRing,
                              active
                                ? "bg-slate-100 text-slate-900"
                                : "text-slate-700 active:bg-slate-100/70"
                            )}
                          >
                            {active ? (
                              <span
                                className="absolute left-0.5 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-emerald-500"
                                aria-hidden
                              />
                            ) : null}
                            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-current [&_svg]:size-[17px]">
                              {section.icon ?? (
                                <span className="block h-1.5 w-1.5 rounded-full bg-current opacity-30" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.005em]">
                              {section.label}
                            </span>
                            {section.badge ? (
                              <Badge value={section.badge} active={active} />
                            ) : null}
                          </Link>
                        );
                      }

                      const isGroupOpen = openGroups[section.label] ?? false;
                      const hasActiveChild = section.items.some((item) =>
                        isLinkActive(pathname, item)
                      );
                      return (
                        <div key={section.label}>
                          <button
                            type="button"
                            aria-expanded={isGroupOpen}
                            aria-label={
                              isGroupOpen
                                ? `Collapse ${section.label}`
                                : `Expand ${section.label}`
                            }
                            onClick={() =>
                              setOpenGroups((prev) => ({
                                ...prev,
                                [section.label]: !(prev[section.label] ?? false),
                              }))
                            }
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition",
                              motion,
                              focusRing,
                              hasActiveChild
                                ? "text-slate-900"
                                : "text-slate-700 active:bg-slate-100/70"
                            )}
                          >
                            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-current [&_svg]:size-[17px]">
                              {section.icon ?? (
                                <span className="block h-1.5 w-1.5 rounded-full bg-current opacity-30" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.005em]">
                              {section.label}
                            </span>
                            {section.badge ? (
                              <Badge value={section.badge} active={false} />
                            ) : null}
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200",
                                isGroupOpen ? "rotate-0" : "-rotate-90",
                                motion
                              )}
                              strokeWidth={2.5}
                              aria-hidden
                            />
                          </button>
                          <div
                            className={cn(
                              "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
                              motion,
                              isGroupOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
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
                                      prefetch={
                                        item.prefetch === false ? false : undefined
                                      }
                                      onClick={() => setOpen(false)}
                                      className={cn(
                                        "group relative flex items-center gap-2.5 rounded-lg py-2 pl-10 pr-3 transition",
                                        motion,
                                        focusRing,
                                        active
                                          ? "bg-slate-100 text-slate-900"
                                          : "text-slate-600 active:bg-slate-100/70"
                                      )}
                                    >
                                      {active ? (
                                        <span
                                          className="absolute left-0.5 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-emerald-500"
                                          aria-hidden
                                        />
                                      ) : null}
                                      <span className="absolute left-[18px] top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-current [&_svg]:size-[15px]">
                                        {item.icon ?? (
                                          <span className="block h-1 w-1 rounded-full bg-current opacity-40" />
                                        )}
                                      </span>
                                      <span className="min-w-0 flex-1 truncate text-[13.5px]">
                                        {item.label}
                                      </span>
                                      {item.badge ? (
                                        <Badge
                                          value={item.badge}
                                          active={active}
                                        />
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
                  </div>
                </nav>

                {/* Footer — optional consumer slot above the user card */}
                {footer || user ? (
                  <div
                    className="shrink-0 border-t border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900/80 p-2 backdrop-blur-sm"
                    style={{
                      paddingBottom:
                        "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)",
                    }}
                  >
                    {footer ? <div className="mb-2">{footer}</div> : null}
                    {user ? (
                      <div className="flex items-center gap-2.5 rounded-xl bg-white dark:bg-slate-900 px-2 py-2 ring-1 ring-slate-200/80">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-[12px] font-bold text-white shadow-sm ring-1 ring-inset ring-white/15"
                          aria-hidden
                        >
                          {(user.initials ?? user.name.charAt(0)).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
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
                          onClick={() => setOpen(false)}
                          aria-label="Settings"
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700",
                            motion,
                            focusRing
                          )}
                        >
                          <Settings
                            className="h-4 w-4"
                            strokeWidth={2}
                            aria-hidden
                          />
                        </Link>
                        {onLogout ? (
                          <button
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              onLogout();
                            }}
                            aria-label="Log out"
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700",
                              motion,
                              focusRing
                            )}
                          >
                            <LogOut
                              className="h-4 w-4"
                              strokeWidth={2}
                              aria-hidden
                            />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
