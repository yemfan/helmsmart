"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TEAM_ACTIONS } from "@/lib/team-actions";

/**
 * The "Actions" hub for one AI employee — the page reached from the sidebar's
 * `Overview · Actions` pair. Lists everything that employee can do as cards.
 * Shared across all employees; each route just passes its key.
 *
 * TEAM_ACTIONS is authored in English at module scope, so nothing here can be
 * translated in place. Labels go through `dashboard_nav` keyed by the English
 * label — the same convention the sidebar uses, so a label that later gets
 * promoted into the sidebar is already translated. Descriptions are keyed by
 * `href` instead: hrefs are stable, whereas rewording a label would silently
 * orphan its description.
 */
export function ActionsHub({ member }: { member: string }) {
  const { t } = useTranslation(["dashboard", "dashboard_nav"]);
  const m = TEAM_ACTIONS[member];
  if (!m) return null;

  const title = t(m.title, { ns: "dashboard_nav", defaultValue: m.title });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={m.overviewHref}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("actionsHub.overviewLink", { title })}
      </Link>

      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {t("actionsHub.heading", { title })}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{t("actionsHub.intro", { title })}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {m.actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 transition hover:border-slate-300 hover:shadow-sm"
          >
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 transition group-hover:bg-indigo-50 group-hover:text-indigo-600">
              {a.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t(a.label, { ns: "dashboard_nav", defaultValue: a.label })}
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-indigo-500" />
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                {t(`actionsHub.desc.${a.href}`, { defaultValue: a.desc })}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
