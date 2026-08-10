"use client";

import { useState, useCallback } from "react";
import type { CronJob } from "@/lib/admin/cronJobs";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<CronJob["category"], string> = {
  seo: "bg-violet-100 text-violet-700",
  leads: "bg-blue-100 text-blue-700",
  emails: "bg-cyan-100 text-cyan-700",
  valuation: "bg-amber-100 text-amber-700",
  data: "bg-emerald-100 text-emerald-700",
  tasks: "bg-slate-100 text-slate-600",
};

const CATEGORY_LABELS: Record<CronJob["category"], string> = {
  seo: "SEO",
  leads: "Leads",
  emails: "Emails",
  valuation: "Valuation",
  data: "Data",
  tasks: "Tasks",
};

function scheduleLabel(cron: string): string {
  const map: Record<string, string> = {
    "0 3 * * *": "Daily 3 AM UTC",
    "30 3 * * *": "Daily 3:30 AM UTC",
    "0 4 * * *": "Daily 4 AM UTC",
    "0 5 * * 0": "Sundays 5 AM UTC",
    "0 6 * * *": "Daily 6 AM UTC",
    "0 2 * * 1": "Mondays 2 AM UTC",
    "0 1 * * *": "Daily 1 AM UTC",
    "0 * * * *": "Every hour",
    "0 9 * * *": "Daily 9 AM UTC",
    "0 */6 * * *": "Every 6 hours",
    "0 2 * * 3": "Wednesdays 2 AM UTC",
    "30 * * * *": "Hourly :30",
    "0 7 * * *": "Daily 7 AM UTC",
    "0 5 * * 1": "Mondays 5 AM UTC",
    "30 5 * * *": "Daily 5:30 AM UTC",
  };
  return map[cron] ?? cron;
}

function durationLabel(ms?: number): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

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
        {/* Category badge */}
        <span
          className={`hidden sm:inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[job.category]}`}
        >
          {CATEGORY_LABELS[job.category]}
        </span>

        {/* Job info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{job.label}</p>
          <p className="truncate text-xs text-slate-500">{scheduleLabel(job.schedule)}</p>
        </div>

        {/* Last run status */}
        {last && (
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <span
              className={`h-2 w-2 rounded-full ${last.ok ? "bg-emerald-400" : "bg-red-400"}`}
            />
            <span className="text-xs text-slate-500">{durationLabel(last.duration)}</span>
            <button
              onClick={() => setExpanded((x) => !x)}
              className="text-xs text-blue-600 hover:underline"
            >
              {expanded ? "Hide" : "Result"}
            </button>
          </div>
        )}

        {/* Trigger button */}
        <button
          onClick={() => onTrigger(job.path)}
          disabled={state.running}
          className="ml-2 shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.running ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Running…
            </span>
          ) : (
            "▶ Run now"
          )}
        </button>
      </div>

      {/* Expanded result panel */}
      {expanded && last && (
        <div className="mx-4 mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-600">
            <span
              className={`rounded px-1.5 py-0.5 text-white text-xs ${last.ok ? "bg-emerald-500" : "bg-red-500"}`}
            >
              {last.ok ? "OK" : "ERROR"} {last.status ? `· HTTP ${last.status}` : ""}
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

// ─── Main component ───────────────────────────────────────────────────────────

export function JobsClient({ jobs }: { jobs: CronJob[] }) {
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
      setStates((s) => ({
        ...s,
        [path]: { running: false, lastRun: data },
      }));
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
    for (const job of jobs) {
      await trigger(job.path);
    }
    setGlobalRunning(false);
  }, [jobs, trigger, globalRunning]);

  const categories = ["all", ...Array.from(new Set(jobs.map((j) => j.category)))] as const;
  const visible = filter === "all" ? jobs : jobs.filter((j) => j.category === filter);

  const runningCount = Object.values(states).filter((s) => s.running).length;
  const successCount = Object.values(states).filter((s) => s.lastRun?.ok).length;
  const errorCount = Object.values(states).filter((s) => s.lastRun && !s.lastRun.ok).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Cron Job Monitor</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {jobs.length} scheduled jobs · {runningCount > 0 ? `${runningCount} running` : "none running"}
            {successCount > 0 && ` · ${successCount} ✓`}
            {errorCount > 0 && ` · ${errorCount} errors`}
          </p>
        </div>

        <button
          onClick={runAll}
          disabled={globalRunning}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {globalRunning ? "Running all…" : "Run all jobs"}
        </button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat as typeof filter)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === cat
                ? "bg-blue-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {cat === "all" ? "All" : CATEGORY_LABELS[cat as CronJob["category"]]}
          </button>
        ))}
      </div>

      {/* Job table */}
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
          <p className="p-6 text-center text-sm text-slate-400">No jobs in this category.</p>
        )}
      </div>

      {/* Legend */}
      <p className="text-xs text-slate-400">
        All times are UTC. Schedules follow standard cron syntax. Jobs run with{" "}
        <code className="rounded bg-slate-100 px-1">CRON_SECRET</code> auth automatically.
      </p>
    </div>
  );
}
