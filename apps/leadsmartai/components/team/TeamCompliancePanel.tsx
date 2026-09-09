"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { AUDIT_KINDS, type AuditFinding, type AuditKind, type StoredAudit } from "@/lib/teams/audit";
import { downloadCsv, toCsv } from "@/lib/teams/csv";

/**
 * Compliance audit on /dashboard/team, for the owner and managers: run the
 * checks over everything the team published in a window, keep the last
 * run on screen, and list each finding with the agent, the post and the
 * words at issue. The button carries its own outcome; the findings are the
 * page's content, not a banner.
 */

const WINDOWS = [7, 30, 90] as const;

const KIND_TONE: Record<AuditKind, string> = {
  fair_housing: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  outcome_promise: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
  unsupported_claim: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  flagged_by_review: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  missing_brokerage: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

const NETWORK: Record<string, string> = { meta: "Facebook · Instagram", facebook: "Facebook", instagram: "Instagram", threads: "Threads", tiktok: "TikTok", linkedin: "LinkedIn", pinterest: "Pinterest", youtube: "YouTube", x: "X" };

export function TeamCompliancePanel({ teamId }: { teamId: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamCompliance.${s}`, vars);
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [audit, setAudit] = useState<StoredAudit | null | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<AuditKind | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/team/${teamId}/audit`)
      .then((r) => r.json())
      .then((j: { ok: boolean; audit?: StoredAudit | null }) => {
        if (!cancelled) setAudit(j.ok ? (j.audit ?? null) : null);
      })
      .catch(() => !cancelled && setAudit(null));
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setRan(false);
    try {
      const r = await fetch(`/api/team/${teamId}/audit?days=${days}`, { method: "POST" });
      const j = (await r.json()) as { ok: boolean; audit?: StoredAudit };
      if (j.ok && j.audit) {
        setAudit(j.audit);
        setOnly(null);
        setRan(true);
        setTimeout(() => setRan(false), 2500);
      } else setError(k("runFailed"));
    } catch {
      setError(k("runFailed"));
    } finally {
      setRunning(false);
    }
  };

  const when = (iso: string | null) => (iso && mounted ? new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" }) : "");
  const who = (id: string) => audit?.directory[id]?.name ?? audit?.directory[id]?.email ?? id;
  const findings: AuditFinding[] = audit ? (only ? audit.report.findings.filter((f) => f.kind === only) : audit.report.findings) : [];
  const chip = (active: boolean) =>
    `inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium transition ${active ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`;
  const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500";
  const td = "px-3 py-2 align-top text-sm text-slate-800 dark:text-slate-200";

  const exportCsv = () => {
    if (!audit) return;
    const header = [k("col.agent"), k("col.kind"), k("col.severity"), k("col.platform"), k("col.date"), k("col.quote"), k("col.link")];
    downloadCsv(
      `team-compliance-${audit.days}d.csv`,
      toCsv(
        header,
        audit.report.findings.map((f) => [who(f.agentId), k(`kind.${f.kind}`), k(`severity.${f.severity}`), f.platform ? (NETWORK[f.platform] ?? f.platform) : "", f.publishedAt ?? "", f.quote, f.url ?? ""]),
      ),
    );
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{k("title")}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex gap-1.5" role="tablist" aria-label={t("pages.teamPerformance.window")}>
            {WINDOWS.map((w) => (
              <button key={w} type="button" role="tab" aria-selected={days === w} className={chip(days === w)} onClick={() => setDays(w)}>
                {t(`pages.teamPerformance.days.${w}`)}
              </button>
            ))}
          </div>
          <button type="button" onClick={run} disabled={running} className="inline-flex min-h-8 items-center rounded-full bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {running ? k("running") : ran ? k("ranNow") : audit ? k("runAgain") : k("run")}
          </button>
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      {audit === undefined ? (
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-busy />
      ) : audit === null ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{k("never")}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            {k("lastRun", { date: when(audit.ranAt), by: who(audit.ranBy), days: audit.days })}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { key: "postsReviewed", value: audit.report.postsReviewed },
              { key: "postsFlagged", value: audit.report.postsFlagged },
              { key: "agentsFlagged", value: audit.report.agentsFlagged },
              { key: "findings", value: audit.report.findings.length },
            ].map(({ key, value }) => (
              <div key={key} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k(`stat.${key}`)}</dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value.toLocaleString(locale)}</dd>
              </div>
            ))}
          </dl>

          {audit.report.findings.length === 0 ? (
            <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">{k("clean")}</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={k("byKind")}>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k("byKind")}</span>
                {AUDIT_KINDS.filter((kind) => (audit.report.byKind[kind] ?? 0) > 0).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={only === kind}
                    onClick={() => setOnly(only === kind ? null : kind)}
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition ${KIND_TONE[kind]} ${only === kind ? "ring-2 ring-offset-1 ring-slate-900 dark:ring-slate-100" : ""}`}
                  >
                    <span className="font-semibold tabular-nums">{(audit.report.byKind[kind] ?? 0).toLocaleString(locale)}</span>
                    {k(`kind.${kind}`)}
                  </button>
                ))}
                {only ? (
                  <button type="button" onClick={() => setOnly(null)} className="text-xs text-slate-600 underline hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                    {k("showAll")}
                  </button>
                ) : null}
              </div>
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[56rem]">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className={th}>{k("col.agent")}</th>
                      <th className={th}>{k("col.kind")}</th>
                      <th className={th}>{k("col.quote")}</th>
                      <th className={`${th} hidden md:table-cell`}>{k("col.platform")}</th>
                      <th className={`${th} hidden md:table-cell`}>{k("col.date")}</th>
                      <th className={th}>{k("col.link")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {findings.map((f, i) => (
                      <tr key={`${f.postId}-${f.kind}-${i}`}>
                        <td className={`${td} whitespace-nowrap font-medium`}>{who(f.agentId)}</td>
                        <td className={td}>
                          <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ring-1 ${KIND_TONE[f.kind]}`}>{k(`kind.${f.kind}`)}</span>
                        </td>
                        <td className={`${td} max-w-md`}>
                          <span className="text-slate-700 dark:text-slate-300">“{f.quote}”</span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">{k(`why.${f.kind}`)}</span>
                        </td>
                        <td className={`${td} hidden md:table-cell`}>{f.platform ? (NETWORK[f.platform] ?? f.platform) : ""}</td>
                        <td className={`${td} hidden md:table-cell whitespace-nowrap text-slate-500`}>{when(f.publishedAt)}</td>
                        <td className={td}>
                          {f.url ? (
                            <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
                              {k("open")}
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">{k("note")}</p>
            {audit.report.findings.length > 0 ? (
              <button type="button" onClick={exportCsv} className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:text-slate-300">
                {t("pages.teamMarketing.exportCsv")}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
