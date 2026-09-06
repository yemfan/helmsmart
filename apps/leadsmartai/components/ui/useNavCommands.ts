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

/**
 * Command-palette entries, DERIVED from the sidebar config so the two can
 * never disagree again (the old hand-written list still said "Inbox" and
 * "Leads" after the sidebar had moved on to "Conversations" and "Contacts").
 *
 * Lives in its own file because it binds the `dashboard_nav` namespace —
 * the palette itself binds `dashboard`, and the i18n namespace checker
 * expects one hook per file.
 */
export type NavCommand = { label: string; path: string; keywords: string };

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

export function useNavCommands(): NavCommand[] {
  const { t, i18n } = useTranslation("dashboard_nav");
  return useMemo(
    () =>
      // Role-gated entries (Admin, Support) are left out: the palette has no
      // role context, and those readers still have the sidebar.
      commandsFromNav(filterNavSectionsByRole(leadSmartNav as NavSection[], null), (s) =>
        t(s, { defaultValue: s }),
      ),
    // i18n.language is the real dependency; `t` is stable across a switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language],
  );
}
