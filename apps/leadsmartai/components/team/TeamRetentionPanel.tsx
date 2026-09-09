"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import type { TeamPerformance } from "@/lib/teams/performance";
import { buildRetentionSignals, type RetentionRow, type RetentionSignals } from "@/lib/teams/retention";

/**
 * Retention signals on /dashboard/team, for the owner and managers: this
 * quarter against the last, who to step in with and who to say well done to.
 * Reads the 90-day performance window (which already carries the window
 * before it) and derives the signals in the browser — no new endpoint.
 */

function Figures({ r, locale }: { r: RetentionRow; locale: string }) {
  const { t } = useTranslation("dashboard");
  const n = (v: number) => v.toLocaleString(locale);
  const money = (v: number) => v.toLocaleString(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  return (
    <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
      <div>
        <dt className="inline">{t("pages.teamRetention.activity")}: </dt>
        <dd className="inline tabular-nums">
          {n(r.activity)} <span className="text-slate-400">← {n(r.previousActivity)}</span>
        </dd>
      </div>
      <div>
        <dt className="inline">{t("pages.teamRetention.closings")}: </dt>
        <dd className="inline tabular-nums">
          {n(r.dealsClosed)} <span className="text-slate-400">← {n(r.previousDealsClosed)}</span>
        </dd>
      </div>
      <div>
        <dt className="inline">{t("pages.teamRetention.volume")}: </dt>
        <dd className="inline tabular-nums">
          {money(r.closedVolume)} <span className="text-slate-400">← {money(r.previousClosedVolume)}</span>
        </dd>
      </div>
    </dl>
  );
}

export function TeamRetentionPanel({ teamId }: { teamId: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamRetention.${s}`, vars);
  const [signals, setSignals] = useState<RetentionSignals | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/team/${teamId}/performance?days=90`)
      .then((r) => r.json())
      .then((j: { ok: boolean; performance?: TeamPerformance }) => {
        if (cancelled) return;
        if (j.ok && j.performance) setSignals(buildRetentionSignals(90, j.performance.rows));
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const who = (r: RetentionRow) => r.name ?? r.email ?? r.agentId;
  const chipRisk = "rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900";
  const chipRise = "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{k("title")}</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k("subtitle")}</p>

      {failed ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("pages.teamPerformance.loadFailed")}</p>
      ) : !signals ? (
        <div className="mt-4 h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-busy />
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{k("stepIn", { count: signals.atRisk.length })}</h3>
            {signals.atRisk.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{signals.considered === 0 ? k("tooEarly") : k("noneAtRisk")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {signals.atRisk.map((r) => (
                  <li key={r.agentId} className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{who(r)}</span>
                      {r.reasons.map((x) => (
                        <span key={x} className={chipRisk}>
                          {k(`risk.${x}`)}
                        </span>
                      ))}
                    </div>
                    <Figures r={r} locale={locale} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{k("wellDone", { count: signals.rising.length })}</h3>
            {signals.rising.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{k("noneRising")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {signals.rising.map((r) => (
                  <li key={r.agentId} className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{who(r)}</span>
                      {r.reasons.map((x) => (
                        <span key={x} className={chipRise}>
                          {k(`rise.${x}`)}
                        </span>
                      ))}
                    </div>
                    <Figures r={r} locale={locale} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{k("note")}</p>
    </section>
  );
}
