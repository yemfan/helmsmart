import Link from "next/link";
import type { WorkforceSummary } from "@helm/dna-intelligence";
import { getServerT } from "@/lib/i18n/server";

/**
 * The org-wide half of the AI workforce: what the whole team added up to over
 * the window, and a way through to the people.
 *
 * It used to carry a card per employee — name, face, metrics, avatar picker —
 * which is now `/ai-team`, where the same card also carries the teammate's job,
 * their limits, their recent work and the dial that governs them. Two screens
 * showing the same roster meant the owner had to learn which one could change
 * anything; this one answers "how is the team doing", that one answers "who
 * works for me and what may they do".
 */

/**
 * "calls_answered" → "Calls Answered", the fallback for a metric key with no
 * entry under `metrics.*`. See `command-center-view.tsx` for the same rule.
 */
function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function WorkforceBoard({ summary }: { summary: WorkforceSummary }) {
  const t = await getServerT("home");

  if (summary.employees.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <h2 className="text-lg font-semibold text-slate-900">{t("commandCenter.board.emptyTitle")}</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6 max-w-md mx-auto">{t("commandCenter.board.emptyBody")}</p>
        <Link
          href="/ai-team"
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          {t("commandCenter.board.meetTheTeam")}
        </Link>
      </div>
    );
  }

  const totalKeys = Object.keys(summary.totals);

  return (
    <div className="space-y-4">
      {totalKeys.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {totalKeys.map((k) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-semibold text-slate-900">{summary.totals[k]}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t(`metrics.${k}`, { defaultValue: humanize(k) })}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-slate-600">
        {t("commandCenter.board.teamCount", { count: summary.employees.length })}{" "}
        <Link href="/ai-team" className="font-medium text-indigo-600 hover:text-indigo-800">
          {t("commandCenter.board.meetTheTeam")}
        </Link>
      </p>
    </div>
  );
}
