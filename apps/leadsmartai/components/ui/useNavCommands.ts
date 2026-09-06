"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  filterNavSectionsByRole,
  isNavDivider,
  isNavGroup,
  isNavSectionLabel,
  type NavSection,
} from "@repo/ui";
import { leadSmartNav } from "@/nav.config";
import { TEAM_ACTIONS } from "@/lib/team-actions";

/**
 * Command-palette entries, DERIVED from the sidebar config so the two can
 * never disagree again (the old hand-written list still said "Inbox" and
 * "Leads" after the sidebar had moved on to "Conversations" and "Contacts").
 *
 * Also every AI teammate's actions (CMA, House Search, Missed Calls…), which
 * the sidebar no longer lists one by one since each assistant became a single
 * row — the palette is where "cma" should still land you on the CMA page.
 *
 * Lives in its own file because it binds the `dashboard_nav` namespace —
 * the palette itself binds `dashboard`, and the i18n namespace checker
 * expects one hook per file.
 */
export type NavCommand = {
  kind: "page" | "action";
  label: string;
  path: string;
  keywords: string;
  /** Actions only: the teammate the action belongs to, translated. */
  group?: string;
};

/** Search synonyms per destination, on top of the translated label. */
const KEYWORDS: Record<string, string> = {
  "/dashboard/boss": "max ask boss assistant home command",
  "/dashboard/inbox": "inbox messages sms email conversations calls",
  "/dashboard/tasks": "tasks todo follow-up",
  "/dashboard/calendar": "calendar appointments schedule",
  "/dashboard/contacts": "leads contacts people pipeline crm sphere",
  "/dashboard/properties": "properties listings",
  "/dashboard/transactions": "transactions deals closing",
  "/dashboard/offers": "offers",
  "/dashboard/showings": "showings tours",
  "/dashboard/hub": "hub website public page username handle pixel analytics",
  "/dashboard/settings": "settings preferences",
  "/dashboard/billing": "billing plan credits subscription",
  "/account/profile": "profile account name photo branding",
  "/dashboard/ai-team": "team assistants pause skills",
  "/dashboard/cma": "cma comps valuation price pricing market analysis",
  "/dashboard/house-search": "search homes buyer listings",
  "/dashboard/calls": "call log recordings",
  "/dashboard/missed-call": "missed calls text-back",
};

function commandsFromNav(
  sections: NavSection[],
  label: (english: string) => string,
): NavCommand[] {
  const out: NavCommand[] = [];
  const seen = new Set<string>();
  const push = (english: string, href: string, groupEnglish?: string) => {
    if (seen.has(href)) return;
    seen.add(href);
    const shown = groupEnglish ? `${label(groupEnglish)} · ${label(english)}` : label(english);
    out.push({
      kind: "page",
      label: shown,
      path: href,
      keywords: `${KEYWORDS[href] ?? ""} ${english.toLowerCase()} ${shown.toLowerCase()}`,
    });
  };
  for (const s of sections) {
    if (isNavDivider(s) || isNavSectionLabel(s)) continue;
    if (isNavGroup(s)) {
      for (const item of s.items) push(item.label, item.href, s.label);
    } else {
      push(s.label, s.href);
    }
  }
  return out;
}

function commandsFromActions(label: (english: string) => string, taken: Set<string>): NavCommand[] {
  const out: NavCommand[] = [];
  for (const member of Object.values(TEAM_ACTIONS)) {
    const group = label(member.title);
    for (const a of member.actions) {
      if (taken.has(a.href)) continue;
      taken.add(a.href);
      const shown = label(a.label);
      out.push({
        kind: "action",
        label: shown,
        path: a.href,
        group,
        keywords: `${KEYWORDS[a.href] ?? ""} ${a.label.toLowerCase()} ${shown.toLowerCase()} ${a.desc.toLowerCase()} ${group.toLowerCase()}`,
      });
    }
  }
  return out;
}

export function useNavCommands(): NavCommand[] {
  const { t, i18n } = useTranslation("dashboard_nav");
  return useMemo(
    () => {
      const label = (s: string) => t(s, { defaultValue: s });
      // Role-gated entries (Admin, Support) are left out: the palette has no
      // role context, and those readers still have the sidebar.
      const pages = commandsFromNav(filterNavSectionsByRole(leadSmartNav as NavSection[], null), label);
      const taken = new Set(pages.map((p) => p.path));
      return [...pages, ...commandsFromActions(label, taken)];
    },
    // i18n.language is the real dependency; `t` is stable across a switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.language],
  );
}
