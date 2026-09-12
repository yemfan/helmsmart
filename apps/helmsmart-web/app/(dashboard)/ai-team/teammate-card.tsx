import Link from "next/link";
import { intlLocale } from "@leadsmart/i18n";
import { getServerT } from "@/lib/i18n/server";
import type { ActivityRow } from "@/lib/ai-activity";
import type { AutonomyLevel } from "@/lib/ai-team/autonomy";
import { EmployeeAvatarPicker } from "./employee-avatar-picker";
import { AutonomyDial } from "./autonomy-dial";

/**
 * One AI teammate, whole: their face and job, the dial that governs them,
 * what they are allowed to touch, what they did lately and what it added up to.
 *
 * Status is text in the page's own colour — a teammate nobody has started is a
 * plain grey line, not a badge (`CLAUDE.md`). The only colour on the card is a
 * warning tone on a line of work that should have happened and didn't.
 */

/** "calls_answered" → "Calls Answered", for a key with no entry under `metrics.*`. */
function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function TeammateCard({
  employeeId,
  slug,
  name,
  role,
  status,
  avatar,
  levels,
  current,
  canChange,
  metrics,
  work,
  setUpHref,
  locale,
  timeZone,
}: {
  employeeId: string;
  slug: string;
  name: string;
  /** The job title as the row holds it — the `aiRoles` bundle is keyed by it. */
  role: string;
  status: string;
  avatar: string;
  levels: AutonomyLevel[];
  current: AutonomyLevel;
  canChange: boolean;
  metrics: Record<string, number>;
  work: ActivityRow[];
  setUpHref: string;
  locale: string;
  timeZone: string;
}) {
  const t = await getServerT("home");
  const tc = await getServerT("common");

  const metricKeys = Object.keys(metrics).filter((k) => metrics[k] > 0);
  const dayFmt = new Intl.DateTimeFormat(intlLocale(locale), { timeZone, month: "short", day: "numeric" });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      {/* Who */}
      <div className="flex items-start gap-4">
        <EmployeeAvatarPicker employeeId={employeeId} name={name} value={avatar} />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{name}</h2>
          <p className="text-xs text-slate-500">{tc(`aiRoles.${role}`, { defaultValue: role })}</p>
          <p className="mt-2 text-sm text-slate-600">{t(`aiTeam.job.${slug}`)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {status === "draft"
              ? t("aiTeam.draftNote", { name })
              : status === "paused"
                ? t("aiTeam.pausedNote", { name })
                : t("aiTeam.workingNote", { name })}
          </p>
        </div>
      </div>

      {/* The dial */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        {levels.length > 0 ? (
          <AutonomyDial slug={slug} name={name} levels={levels} current={current} canChange={canChange} />
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("aiTeam.dial.legend", { name })}
            </p>
            <p className="mt-2 text-sm text-slate-600">{t(`aiTeam.noDial.${slug}`, { name })}</p>
          </>
        )}
      </div>

      {/* Limits */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("aiTeam.limitsHeading", { name })}
        </p>
        <p className="mt-2 text-sm text-slate-600">{t(`aiTeam.limits.${slug}`, { name })}</p>
      </div>

      {/* Scorecard */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("aiTeam.scoreHeading")}</p>
        {metricKeys.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t("aiTeam.noScore")}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-3">
            {metricKeys.map((k) => (
              <div key={k}>
                <p className="text-lg font-semibold text-slate-900">{metrics[k]}</p>
                <p className="text-[11px] text-slate-500">{t(`metrics.${k}`, { defaultValue: humanize(k) })}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent work */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("aiTeam.workHeading")}</p>
        {work.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            {t(`aiTeam.emptyWork.${slug}`, { name })}{" "}
            <Link href={setUpHref} className="font-medium text-indigo-600 hover:text-indigo-800">
              {t(`aiTeam.setUp.${slug}`)}
            </Link>
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-slate-100">
            {work.map((r) => (
              <li key={r.key}>
                <Link
                  href={r.href}
                  className="flex items-center gap-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:text-slate-900"
                >
                  <span className={`min-w-0 flex-1 ${r.tone === "warning" ? "text-amber-700" : ""}`}>
                    {r.text}
                    {r.detail ? <span className="text-slate-400">{" · "}{r.detail}</span> : null}
                  </span>
                  <time dateTime={r.at} className="shrink-0 text-xs tabular-nums text-slate-400">
                    {dayFmt.format(new Date(r.at))}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
