import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getPlaybookAutoSettings, listPlaybookRuns } from "@/lib/closeboss/playbook-runs/service";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";
import { AutoSettingsCard } from "./AutoSettingsCard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("playbookRuns.metaTitle", { ns: "dashboard" }),
    description: t("playbookRuns.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

/** `toLocaleDateString()` with no argument follows the SERVER's locale here,
 *  which is neither the agent's browser nor their chosen language. */
function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(locale);
}

/**
 * Playbook runs — the agent's stateful selling/buying engagements. Started from
 * the Boss ("start the selling playbook for 123 Main St"); each run drives prep
 * → plan → execute → optimize with the AI team.
 */
export default async function PlaybookRunsPage() {
  const t = await getServerT();
  const locale = intlLocale(await getServerLocale());
  const ctx = await getCurrentAgentContext();
  const [runs, auto] = await Promise.all([
    listPlaybookRuns(ctx.agentId),
    getPlaybookAutoSettings(ctx.agentId),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {t("playbookRuns.heading", { ns: "dashboard" })}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("playbookRuns.intro", { ns: "dashboard" })}
        </p>
      </div>

      <AutoSettingsCard autoSelling={auto.autoSelling} autoBuying={auto.autoBuying} />

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t("playbookRuns.emptyTitle", { ns: "dashboard" })}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            {t("playbookRuns.emptyHint", { ns: "dashboard" })}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {runs.map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/playbook-runs/${r.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-white">{r.title}</span>
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    {t(r.type === "house_selling" ? "playbookRuns.typeSelling" : "playbookRuns.typeBuying", {
                      ns: "dashboard",
                    })}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {t(`playbookRuns.status.${r.status}`, { ns: "dashboard", defaultValue: r.status })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("playbookRuns.meta", {
                    ns: "dashboard",
                    phase: t(`playbookRuns.phase.${r.phase}`, {
                      ns: "dashboard",
                      defaultValue: r.phase,
                    }),
                    updated: fmtDate(r.updated_at, locale),
                    review: fmtDate(r.next_review_at, locale),
                  })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
