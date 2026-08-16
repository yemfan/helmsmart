"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { JobHealth, ObservabilityReport } from "@/lib/observability/collect";
import { intlLocale } from "@/lib/i18n/locale";

export function ObservabilityClient({ report }: { report: ObservabilityReport }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const { crons, onDemand } = useMemo(() => {
    const crons: JobHealth[] = [];
    const onDemand: JobHealth[] = [];
    for (const j of report.jobs) {
      (j.kind === "cron" ? crons : onDemand).push(j);
    }
    return { crons, onDemand };
  }, [report.jobs]);

  const stuckCrons = crons.filter((j) => isStuck(j));
  const totalErrors = report.jobs.reduce((s, j) => s + j.errored, 0);
  const totalSent = report.jobs.reduce((s, j) => s + j.sent, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t("pages.adminPages.observability")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Per-cron + AI-feature health over the last {report.windowDays} days. Support tool
          — not linked in the sidebar.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("pages.adminPages.totalSent")} value={totalSent} tone="blue" />
        <Stat label={t("pages.adminPages.totalErrors")} value={totalErrors} tone={totalErrors > 0 ? "red" : "neutral"} />
        <Stat label={t("pages.adminPages.cronsTracked")} value={crons.length} />
        <Stat
          label={t("pages.adminPages.stuckCrons")}
          value={stuckCrons.length}
          tone={stuckCrons.length > 0 ? "red" : "green"}
          hint="no run in expected window"
        />
      </div>

      {stuckCrons.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-semibold">⚠️ {stuckCrons.length} cron(s) may be stuck:</div>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {stuckCrons.map((j) => (
              <li key={j.id}>
                <strong>{j.label}</strong> — last run{" "}
                {j.lastRunIso ? new Date(j.lastRunIso).toLocaleString(locale) : t("pages.adminCommon.never")}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px]">
            &quot;Stuck&quot; means no activity is visible for longer than 2× the
            schedule&apos;s cadence. Check Vercel Cron logs for failed invocations or
            check whether the migration has landed in this environment.
          </p>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">{t("pages.adminPages.scheduledCrons")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {crons.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">{t("pages.adminPages.onDemandAi")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {onDemand.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      </section>
    </div>
  );
}

function JobCard({ job }: { job: JobHealth }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const total = job.sent + job.skipped + job.errored;
  const lastRunLabel = job.lastRunIso
    ? new Date(job.lastRunIso).toLocaleString(locale)
    : "Never";
  const stuck = isStuck(job);

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        stuck
          ? "border-red-300"
          : job.errored > 0
            ? "border-amber-300"
            : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{job.label}</div>
          <code className="mt-0.5 block truncate text-[11px] text-slate-500">
            {job.schedule}
          </code>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`text-[11px] ${stuck ? "text-red-700" : "text-slate-500"}`}
          >{t("pages.adminPages.lastRun")}</div>
          <div
            className={`text-[11px] font-medium ${stuck ? "text-red-700" : "text-slate-900"}`}
          >
            {lastRunLabel}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
        <Pill label={t("pages.adminCommon.sent")} value={job.sent} tone="green" />
        <Pill label={t("pages.adminCommon.skipped")} value={job.skipped} tone="slate" />
        <Pill label={t("pages.adminCommon.errored")} value={job.errored} tone={job.errored > 0 ? "red" : "slate"} />
      </div>

      {job.topSkipReasons.length > 0 ? (
        <div className="mt-3 text-[11px]">
          <div className="font-medium text-slate-600">{t("pages.adminPages.topSkipReasons")}</div>
          <ul className="mt-1 space-y-0.5 text-slate-600">
            {job.topSkipReasons.map((r) => (
              <li key={r.reason} className="flex justify-between">
                <span className="truncate pr-2" title={r.reason}>
                  {r.reason}
                </span>
                <span className="tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {job.sampleErrors.length > 0 ? (
        <div className="mt-3 rounded-md bg-red-50 p-2 text-[11px] text-red-800">
          <div className="font-medium">{t("pages.adminPages.recentErrors")}</div>
          <ul className="mt-1 space-y-0.5">
            {job.sampleErrors.map((e, i) => (
              <li key={i} className="truncate" title={e}>
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {total === 0 && !stuck ? (
        <div className="mt-3 text-[11px] text-slate-400">{t("pages.adminPages.noActivityWindow")}</div>
      ) : null}
    </div>
  );
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "slate" | "red";
}) {
  const bg = {
    green: "bg-green-50 text-green-800 border-green-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    red: "bg-red-50 text-red-700 border-red-200",
  }[tone];
  return (
    <div className={`rounded-lg border px-2 py-1 ${bg}`}>
      <div className="text-[10px] font-medium uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: "red" | "green" | "blue" | "neutral";
  hint?: string;
}) {
  const color =
    tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-green-700"
        : tone === "blue"
          ? "text-blue-700"
          : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
      {hint ? <div className="text-[10px] text-slate-400">{hint}</div> : null}
    </div>
  );
}

/**
 * Heuristic "did this cron run recently?" check. Each cron has an
 * expected cadence; if the last-run timestamp is older than 2× that
 * cadence, we flag it as stuck. Quick-n-dirty — a real monitoring
 * system would track the schedule separately, but this catches the
 * 80% case.
 */
function isStuck(job: JobHealth): boolean {
  if (job.kind !== "cron") return false;
  if (!job.lastRunIso) {
    // A cron with no runs EVER in the window — might be OK (no work to
    // do) or might be stuck. We only flag when the table has >0
    // eligible agents, which we can't easily determine here. Leave
    // unflagged; the card's "No activity" line points it out softly.
    return false;
  }
  const ageMs = Date.now() - new Date(job.lastRunIso).getTime();
  const thresholdMs = stuckThresholdMs(job.id);
  return ageMs > thresholdMs;
}

function stuckThresholdMs(jobId: string): number {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  switch (jobId) {
    case "transactions-overdue-nudges":
      return 2 * DAY; // daily cron, flag if silent 2 days
    case "transactions-wire-fraud-alert":
      return 13 * HOUR; // every 6h, flag if silent >12h
    case "growth-weekly-digest":
      return 9 * DAY; // weekly Mondays, flag if silent >9 days
    case "seller-weekly-updates":
      return 9 * DAY;
    case "offer-expirations":
      return 5 * HOUR; // every 2h, flag if silent >4h
    case "open-house-followups":
      return 3 * HOUR; // hourly, flag if silent >2h
    default:
      return 2 * DAY;
  }
}
