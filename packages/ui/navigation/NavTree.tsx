"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavConfig, NavLeafItem, NavSection } from "./types";
import { isNavDivider, isNavGroup, isNavSectionLabel } from "./types";
import { isGroupActive, isLinkActive } from "./matchPath";
import { CollapsibleNavGroup } from "./CollapsibleNavGroup";

function NavLeafLink({
  link,
  onNavigate,
}: {
  link: NavLeafItem;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isLinkActive(pathname, link);

  const rowCls = active
    ? "bg-blue-600 font-medium text-white shadow-sm"
    : "text-slate-700 hover:bg-white hover:text-slate-900";

  const badgeCls = active
    ? "bg-white/20 text-white"
    : "bg-slate-200/80 text-slate-600";

  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${rowCls}`}
    >
      {link.icon ? (
        <span className={`shrink-0 [&>svg]:h-4 [&>svg]:w-4 ${active ? "text-white" : "text-slate-400"}`}>
          {link.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{link.label}</span>
      {link.badge ? (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeCls}`}
        >
          {link.badge}
        </span>
      ) : null}
    </Link>
  );
}

function renderSection(
  section: NavSection,
  variant: "consumer" | "agent",
  pathname: string | null,
  onNavigate?: () => void
) {
  if (isNavDivider(section)) {
    return (
      <div
        className="my-1 border-t border-slate-200/90 dark:border-slate-700 pt-1"
        role="separator"
        aria-hidden
      />
    );
  }
  if (isNavSectionLabel(section)) {
    return (
      <p className="mt-2 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {section.label}
      </p>
    );
  }
  if (!isNavGroup(section)) {
    return <NavLeafLink link={section} onNavigate={onNavigate} />;
  }
  return (
    <CollapsibleNavGroup
      title={section.label}
      titleIcon={section.icon}
      active={isGroupActive(pathname, section)}
      variant={variant}
    >
      {section.items.map((item) => (
        <NavLeafLink key={item.href} link={item} onNavigate={onNavigate} />
      ))}
    </CollapsibleNavGroup>
  );
}

export type NavTreeProps = {
  nav: NavConfig;
  variant: "consumer" | "agent";
  onNavigate?: () => void;
};

export function NavTree({ nav, variant, onNavigate }: NavTreeProps) {
  const pathname = usePathname();

  return (
    <>
      {nav.sidebarTitle ? (
        <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {nav.sidebarTitle}
        </p>
      ) : null}
      <nav className="flex flex-col gap-2">
        {nav.sections.map((section, i) => (
          <Fragment
            key={
              isNavDivider(section)
                ? `divider-${i}`
                : isNavSectionLabel(section)
                  ? `section-label-${section.label}-${i}`
                  : isNavGroup(section)
                    ? `group-${section.label}-${i}`
                    : `${(section as NavLeafItem).href}-${i}`
            }
          >
            {renderSection(section, variant, pathname, onNavigate)}
          </Fragment>
        ))}
      </nav>
    </>
  );
}
