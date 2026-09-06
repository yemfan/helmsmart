"use client";

/**
 * Premium collapsed SaaS sidebar (desktop `lg+`; below `lg` use {@link MobileSidebar} in the top bar):
 * default-collapsed icon rail, hover tooltips, animated groups, `isLinkActive` + `match[]`,
 * gray palette; header toggles rail with ChevronRight (collapsed) / ChevronDown (expanded).
 * Consumes the same `NavSection` trees as PropertyTools + LeadSmart AI `nav.config`.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { NavSection } from "./types";
import { isNavDivider, isNavGroup, isNavSectionLabel } from "./types";
import { isLinkActive } from "./matchPath";

export type PremiumSidebarProps = {
  appName: string;
  sections: NavSection[];
  footer?: ReactNode;
  /**
   * Rendered above the main nav (below the optional branding header), e.g. assigned agent card.
   * Use with `branding="none"` to pin utility UI to the top of the rail.
   */
  topSlot?: ReactNode;
  /** Shown under the app name when expanded (e.g. nav config `sidebarTitle`). */
  workspaceLabel?: string;
  /**
   * `"full"` (default): app initial / name + workspace label in the sidebar header.
   * `"none"`: no app branding in the sidebar — only collapse control + nav (e.g. brand lives in the top bar).
   */
  branding?: "full" | "none";
  /**
   * `"viewport"` (default): `h-screen` desktop sidebar (full viewport).
   * `"stretch"`: `h-full` — use when the sidebar sits **below** a top bar inside a flex column.
   */
  height?: "viewport" | "stretch";
  className?: string;
};

function cn(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Stable DOM id for `aria-controls` (no hooks in loops). */
function navGroupPanelId(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `premium-sidebar-group-${slug || "section"}`;
}

const motionSafe = "motion-reduce:transition-none motion-reduce:duration-0";
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

/** Collapsed-rail tooltip — simple fade (reference layout). */
function RailTooltip({
  children,
  label,
  collapsed,
}: {
  children: ReactNode;
  label: string;
  collapsed: boolean;
}) {
  if (!collapsed) return <>{children}</>;

  return (
    <div className="group relative flex w-full justify-center">
      {children}
      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap",
          "rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium tracking-wide text-white/95 shadow-lg shadow-slate-900/20",
          "opacity-0 transition-opacity duration-150 ease-out motion-reduce:transition-none",
          "group-hover:opacity-100"
        )}
      >
        {label}
      </div>
    </div>
  );
}

function NavIconWrap({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center text-base text-current transition-transform duration-200 ease-out",
        motionSafe,
        "[&_svg]:size-[1.05rem] [&_svg]:shrink-0"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Premium collapsible desktop sidebar: default-collapsed icon rail, hover tooltips,
 * animated groups, and shared active logic for PropertyToolsAI / LeadSmart AI-style nav configs.
 */
export function PremiumSidebar({
  appName,
  sections,
  footer,
  topSlot,
  workspaceLabel = "Workspace",
  branding = "full",
  height = "viewport",
  className = "",
}: PremiumSidebarProps) {
  const pathname = usePathname() ?? "";
  const collapsed = false;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const s of sections) {
      if (isNavGroup(s) && s.defaultOpen) {
        initial[s.label] = true;
      }
    }
    return initial;
  });
  /** Only auto-expand the group that contains the active route when the URL changes — never open other groups the user collapsed. */
  const lastAutoExpandPath = useRef<string | null>(null);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  useLayoutEffect(() => {
    if (lastAutoExpandPath.current === pathname) return;
    lastAutoExpandPath.current = pathname;

    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const section of sectionsRef.current) {
        if (isNavGroup(section)) {
          if (section.items.some((item) => isLinkActive(pathname, item))) {
            next[section.label] = true;
          }
        }
      }
      return next;
    });
  }, [pathname]);

  const showBranding = branding !== "none";
  const useStretchHeight = height === "stretch";
  const titleInitial = appName.trim().charAt(0).toUpperCase() || "A";

  return (
    <aside
      aria-label={appName}
      className={cn(
        "hidden lg:flex lg:shrink-0 lg:flex-col lg:overflow-hidden",
        useStretchHeight ? "lg:h-full lg:min-h-0" : "lg:h-screen",
        "border-r border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/80 backdrop-blur-md",
        "shadow-[1px_0_0_rgba(15,23,42,0.04)]",
        "transition-[width] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]",
        motionSafe,
        collapsed ? "lg:w-[92px]" : "lg:w-[272px]",
        className
      )}
    >
      {/* Header: app name + workspace when branding is shown; no header row when branding is hidden (nav is flush). */}
      {showBranding ? (
        <div
          className={cn(
            "flex h-16 w-full shrink-0 items-center border-b border-slate-200/80 bg-white/80 px-4 text-left backdrop-blur-sm",
            "transition-colors"
          )}
        >
          <div className="min-w-0 flex-1 pr-1">
            {collapsed ? (
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold tracking-tight text-white shadow-sm shadow-slate-900/15",
                  "transition-transform duration-200"
                )}
                aria-hidden
              >
                {titleInitial}
              </div>
            ) : (
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{appName}</div>
                <div className="truncate text-[11px] font-medium uppercase tracking-wider text-slate-400">{workspaceLabel}</div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {topSlot ? (
        <div className="shrink-0 border-b border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900/70 px-3 py-3 backdrop-blur-sm">
          {topSlot}
        </div>
      ) : null}

      {/* Nav */}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 [scrollbar-gutter:stable] [scrollbar-color:rgba(148,163,184,0.5)_transparent]">
        <nav className="space-y-0.5">
          {sections.map((section, sectionIdx) => {
            if (isNavDivider(section)) {
              return (
                <div
                  key={`nav-divider-${sectionIdx}`}
                  className="my-0.5 border-t border-slate-200/90 dark:border-slate-700 pt-0.5"
                  role="separator"
                  aria-hidden
                />
              );
            }
            if (isNavSectionLabel(section)) {
              // Legacy sidebar doesn't render supercategory bands.
              return null;
            }
            if (!isNavGroup(section)) {
              const active = isLinkActive(pathname, section);
              const link = (
                <Link
                  href={section.href}
                  prefetch={section.prefetch === false ? false : undefined}
                  title={collapsed ? section.label : undefined}
                  className={cn(
                    "group/link flex items-center rounded-2xl transition-all duration-200 ease-out",
                    motionSafe,
                    focusRing,
                    collapsed ? "justify-center px-3 py-1.5" : "gap-2.5 px-3 py-1.5",
                    active
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/15"
                      : "text-slate-600 hover:bg-slate-100/90 hover:text-slate-900"
                  )}
                >
                  <NavIconWrap>{section.icon ?? <span className="text-xs opacity-70">•</span>}</NavIconWrap>
                  {!collapsed ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{section.label}</span>
                      {section.badge ? (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                            active ? "bg-white/15 text-white" : "bg-slate-200/90 text-slate-700"
                          )}
                        >
                          {section.badge}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </Link>
              );

              return (
                <RailTooltip key={`${section.href}-${section.label}`} label={section.label} collapsed={collapsed}>
                  {link}
                </RailTooltip>
              );
            }

            const isOpen = openGroups[section.label] ?? false;
            const hasActiveChild = section.items.some((item) => isLinkActive(pathname, item));
            const groupPanelId = navGroupPanelId(section.label);

            const groupBtn = (
              <button
                type="button"
                id={`${groupPanelId}-trigger`}
                title={collapsed ? `${section.label} — click to expand sidebar` : undefined}
                aria-expanded={!collapsed && isOpen}
                aria-controls={groupPanelId}
                aria-label={
                  isOpen ? `Collapse ${section.label}` : `Expand ${section.label}`
                }
                onClick={() => {
                  setOpenGroups((prev) => ({
                    ...prev,
                    [section.label]: !(prev[section.label] ?? false),
                  }));
                }}
                className={cn(
                  "group/nav flex w-full items-center rounded-2xl text-left transition-all duration-200 ease-out",
                  motionSafe,
                  focusRing,
                  collapsed ? "justify-center px-3 py-1.5" : "gap-2.5 px-3 py-1.5",
                  hasActiveChild
                    ? "bg-slate-100/90 text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <NavIconWrap>{section.icon ?? <span className="text-xs opacity-70">•</span>}</NavIconWrap>
                {!collapsed ? (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{section.label}</span>
                    <span
                      className={cn(
                        "shrink-0 transition-colors group-hover/nav:text-slate-700",
                        hasActiveChild ? "text-slate-700" : "text-slate-500"
                      )}
                      aria-hidden
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
                      ) : (
                        <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
                      )}
                    </span>
                  </>
                ) : null}
              </button>
            );

            return (
              <div key={section.label} className="space-y-0.5">
                <RailTooltip label={section.label} collapsed={collapsed}>
                  {groupBtn}
                </RailTooltip>

                {!collapsed ? (
                  <div
                    id={groupPanelId}
                    role="region"
                    aria-labelledby={`${groupPanelId}-trigger`}
                    className={cn(
                      "grid overflow-hidden transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)]",
                      motionSafe,
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    )}
                  >
                    <div className="min-h-0">
                      <div className="space-y-0.5 pl-3">
                        {section.items.map((item) => {
                          const active = isLinkActive(pathname, item);
                          return (
                            <Link
                              key={`${item.href}::${item.label}`}
                              href={item.href}
                              prefetch={item.prefetch === false ? false : undefined}
                              onClick={() => {
                                setOpenGroups((prev) => ({ ...prev, [section.label]: true }));
                              }}
                              className={cn(
                                "group/sublink flex items-center gap-2.5 rounded-xl px-3 py-1 text-sm transition-all duration-200",
                                motionSafe,
                                focusRing,
                                active
                                  ? "bg-slate-900 font-medium text-white shadow-sm shadow-slate-900/10"
                                  : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                              )}
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-current [&_svg]:size-3.5">
                                {item.icon ?? <span className="text-[10px] opacity-60">•</span>}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{item.label}</span>
                              {item.badge ? (
                                <span
                                  className={cn(
                                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                                    active ? "bg-white/15 text-white" : "bg-slate-200/90 text-slate-700"
                                  )}
                                >
                                  {item.badge}
                                </span>
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>

      {footer ? (
        <div className="shrink-0 border-t border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900/60 px-3 py-2 backdrop-blur-sm">
          <div className="transition-opacity duration-200">{footer}</div>
        </div>
      ) : null}
    </aside>
  );
}
