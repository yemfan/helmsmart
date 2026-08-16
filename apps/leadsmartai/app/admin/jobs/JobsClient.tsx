"use client";

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { CronJob } from "@/app/api/admin/cron-jobs/route";

interface RunResult {
  ok: boolean;
  status?: number;
  duration?: number;
  result?: unknown;
  error?: string;
}

interface JobState {
  running: boolean;
  lastRun?: RunResult;
}

const CATEGORY_COLORS: Record<CronJob["category"], string> = {
  notifications: "bg-purple-100 text-purple-700",
  ai: "bg-blue-100 text-blue-700",
  leads: "bg-emerald-100 text-emerald-700",
  emails: "bg-cyan-100 text-cyan-700",
  data: "bg-amber-100 text-amber-700",
  tasks: "bg-slate-100 text-slate-600",
};

const CATEGORY_LABELS: Record<CronJob["category"], string> = {
  notifications: "Notifs",
  ai: "AI",
  leads: "Leads",
  emails: "Emails",
  data: "Data",
  tasks: "Tasks",
};

function scheduleLabel(cron: string): string {
  const map: Record<string, string> = {
    "*/15 * * * *": "Every 15 min",
    "0 14 * * *": "Daily 2 PM UTC",
    "30 15 * * *": "Daily 3:30 PM UTC",
    "0 * * * *": "Every hour",
    "0 */6 * * *": "Every 6 hours",
    "15 * * * *": "Hourly :15",
    "0 1 * * *": "Daily 1 AM UTC",
    "0 2 * * 3": "Wednesdays 2 AM UTC",
    "45 * * * *": "Hourly :45",
    "0 5 * * 1": "Mondays 5 AM UTC",
    "30 5 * * *": "Daily 5:30 AM UTC",
    "0 7 * * *": "Daily 7 AM UTC",
  };
  return map[cron] ?? cron;
}

function durationLabel(ms?: number) {
  if (ms == null) return "";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function JobRow({
  job,
  state,
  onTrigger,
}: {
  job: CronJob;
  state: JobState;
  onTrigger: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const last = state.lastRun;

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className={`hidden sm:inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[job.category]}`}
        >
          {CATEGORY_LABELS[job.category]}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{job.label}</p>
          <p className="truncate text-xs text-slate-500">{scheduleLabel(job.schedule)}</p>
        </div>

        {last && (
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <span className={`h-2 w-2 rounded-full ${last.ok ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-xs text-slate-500">{durationLabel(last.duration)}</span>
            <button
              onClick={() => setExpanded((x) => !x)}
              className="text-xs text-[#0072CE] hover:underline"
            >
              {expanded ? "Hide" : "Result"}
            </button>
          </div>
        )}

        <button
          onClick={() => onTrigger(job.path)}
          disabled={state.running}
          className="ml-2 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.running ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#0072CE] border-t-transparent" />
              Running…
            </span>
          ) : (
            "▶ Run now"
          )}
        </button>
      </div>

      {expanded && last && (
        <div className="mx-4 mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-600">
            <span className={`rounded px-1.5 py-0.5 text-white text-xs ${last.ok ? "bg-emerald-500" : "bg-red-500"}`}>
              {last.ok ? "OK" : "ERROR"}{last.status ? ` · HTTP ${last.status}` : ""}
            </span>
            <span>{durationLabel(last.duration)}</span>
          </div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded text-xs text-slate-700">
            {JSON.stringify(last.result ?? last.error, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function JobsClient({ jobs }: { jobs: CronJob[] }) {
  const { t } = useTranslation("dashboard");
  const [states, setStates] = useState<Record<string, JobState>>(
    Object.fromEntries(jobs.map((j) => [j.path, { running: false }]))
  );
  const [filter, setFilter] = useState<CronJob["category"] | "all">("all");
  const [globalRunning, setGlobalRunning] = useState(false);

  const trigger = useCallback(async (path: string) => {
    setStates((s) => ({ ...s, [path]: { ...s[path], running: true } }));
    try {
      const res = await fetch("/api/admin/cron-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const data: RunResult = await res.json();
      setStates((s) => ({ ...s, [path]: { running: false, lastRun: data } }));
    } catch (e: unknown) {
      setStates((s) => ({
        ...s,
        [path]: { running: false, lastRun: { ok: false, error: String(e) } },
      }));
    }
  }, []);

  const runAll = useCallback(async () => {
    if (globalRunning) return;
    setGlobalRunning(true);
    for (const job of jobs) await trigger(job.path);
    setGlobalRunning(false);
  }, [jobs, trigger, globalRunning]);

  const categories = ["all", ...Array.from(new Set(jobs.map((j) => j.category)))] as const;
  const visible = filter === "all" ? jobs : jobs.filter((j) => j.category === filter);

  const runningCount = Object.values(states).filter((s) => s.running).length;
  const successCount = Object.values(states).filter((s) => s.lastRun?.ok).length;
  const errorCount = Object.values(states).filter((s) => s.lastRun && !s.lastRun.ok).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t("pages.adminPages.cronMonitor")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {jobs.length} scheduled jobs
            {runningCount > 0 && ` · ${runningCount} running`}
            {successCount > 0 && ` · ${successCount} ✓`}
            {errorCount > 0 && ` · ${errorCount} errors`}
          </p>
        </div>
        <button
          onClick={runAll}
          disabled={globalRunning}
          className="rounded-lg bg-[#0072CE] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {globalRunning ? "Running all…" : "Run all jobs"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat as typeof filter)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === cat
                ? "bg-[#0072CE] text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat as CronJob["category"]]}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {visible.map((job) => (
          <JobRow
            key={job.path}
            job={job}
            state={states[job.path] ?? { running: false }}
            onTrigger={trigger}
          />
        ))}
        {visible.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-400">{t("pages.adminPages.noJobs")}</p>
        )}
      </div>

      <p className="text-xs text-slate-400">
        All schedules are UTC. Jobs are triggered with{" "}
        <code className="rounded bg-slate-100 px-1">CRON_SECRET</code> auth automatically.
      </p>
    </div>
  );
}
