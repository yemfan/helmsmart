"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkforceRail, { type WorkerState } from "@/components/WorkforceRail";
import { getWorker, type WorkerId } from "@/lib/workforce/workers";

/**
 * The mission page: the plan, what the team is doing, what needs a decision,
 * and the final report.
 *
 * It renders the STEP LEDGER, never the transcript — decisions, findings and
 * results, not the model's working (§20). It polls while the mission is live,
 * because a run continues on the server across several invocations and the page
 * should reflect that without the owner refreshing.
 */

export type MissionStep = {
  id: string;
  worker: WorkerId;
  tool: string;
  status: "running" | "completed" | "pending_approval" | "rejected" | "failed";
  approvalState: "n/a" | "pending" | "approved" | "rejected";
  summary: string | null;
  artifactUrl: string | null;
  creditsSpent: number;
  createdAt: string;
};

export type MissionPayload = {
  mission: {
    id: string;
    objective: string;
    status: string;
    measured_by: string;
    spent_credits: number;
    summary: string | null;
  };
  steps: MissionStep[];
  report: string | null;
};

const LIVE = new Set(["planning", "running"]);

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  planning: { label: "Nina is planning", tone: "text-boss-violet" },
  running: { label: "The team is working", tone: "text-emerald-600" },
  awaiting_approval: { label: "Waiting on you", tone: "text-amber-600" },
  completed: { label: "Done", tone: "text-slate-600" },
  failed: { label: "Didn't finish", tone: "text-red-600" },
  cancelled: { label: "Cancelled", tone: "text-slate-500" },
};

const MEASURED_COPY: Record<string, string> = {
  awareness: "Measured on reach — views and impressions.",
  engagement: "Measured on engagement — likes, comments and saves.",
  traffic: "Measured on traffic — clicks through to your destination. What happens after the click is measured by your own analytics.",
};

const STEP_ICON: Record<MissionStep["status"], string> = {
  running: "⏳",
  completed: "✅",
  pending_approval: "🔔",
  rejected: "⤫",
  failed: "⚠",
};

function railStates(steps: MissionStep[]): Partial<Record<WorkerId, WorkerState>> {
  const out: Partial<Record<WorkerId, WorkerState>> = {};
  for (const s of steps) {
    if (s.status === "running") out[s.worker] = "working";
    else if (s.status === "pending_approval") {
      if (out[s.worker] !== "working") out[s.worker] = "waiting";
    } else if (!out[s.worker]) out[s.worker] = "done";
  }
  return out;
}

export default function MissionView({ initial }: { initial: MissionPayload }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const live = LIVE.has(data.mission.status);

  // Poll only while something is actually happening — a finished mission is a
  // static page and should stop costing requests.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/missions/${data.mission.id}`);
        if (res.ok) setData((await res.json()) as MissionPayload);
      } catch {
        /* transient; the next tick will catch up */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [live, data.mission.id]);

  async function decide(stepId: string, decision: "approved" | "rejected") {
    setDeciding(stepId);
    setError(null);
    try {
      const res = await fetch(`/api/missions/${data.mission.id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId, decision }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "That decision didn't go through. Please try again.");
        return;
      }
      const fresh = await fetch(`/api/missions/${data.mission.id}`);
      if (fresh.ok) setData((await fresh.json()) as MissionPayload);
      router.refresh();
    } catch {
      setError("I couldn't reach the server. Check your connection and try again.");
    } finally {
      setDeciding(null);
    }
  }

  const status = STATUS_COPY[data.mission.status] ?? { label: data.mission.status, tone: "text-slate-600" };
  const pending = data.steps.filter((s) => s.approvalState === "pending");

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mission</p>
          <h1 className="mt-0.5 text-lg font-bold leading-snug text-slate-900">{data.mission.objective}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={`font-semibold ${status.tone}`}>{status.label}</span>
            {data.mission.spent_credits > 0 && <span className="text-slate-500">{data.mission.spent_credits} credits used</span>}
          </div>
          <p className="mt-2 text-xs text-slate-500">{MEASURED_COPY[data.mission.measured_by] ?? ""}</p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-300/60 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        {pending.length > 0 && (
          <section className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4">
            <h2 className="text-sm font-semibold text-amber-900">Needs your decision</h2>
            <ul className="mt-2 space-y-2">
              {pending.map((s) => (
                <li key={s.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <p className="text-sm text-slate-800">{s.summary}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => decide(s.id, "approved")}
                      disabled={deciding === s.id}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {deciding === s.id ? "…" : "Approve"}
                    </button>
                    <button
                      onClick={() => decide(s.id, "rejected")}
                      disabled={deciding === s.id}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Skip
                    </button>
                    {s.artifactUrl && (
                      <a
                        href={s.artifactUrl}
                        className="ml-auto self-center text-xs font-medium text-boss-violet underline underline-offset-2"
                      >
                        Preview
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">What the team did</h2>
          {data.steps.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              {live ? "Nina is working out the plan…" : "Nothing was recorded for this mission."}
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {data.steps.map((s) => {
                const w = getWorker(s.worker);
                return (
                  <li key={s.id} className="flex gap-2.5 rounded-xl border border-slate-100 p-2.5">
                    <span aria-hidden className="pt-0.5 text-sm">
                      {STEP_ICON[s.status]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900">
                        {w.name || w.role}
                        {w.name && <span className="font-normal text-slate-400"> · {w.role}</span>}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-700">{s.summary ?? "Working…"}</p>
                      <div className="mt-1 flex gap-3 text-[11px] text-slate-400">
                        {s.creditsSpent > 0 && <span>{s.creditsSpent} credits</span>}
                        {s.artifactUrl && (
                          <a href={s.artifactUrl} className="text-boss-violet underline underline-offset-2">
                            View
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {data.report && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Nina&apos;s report</h2>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{data.report}</p>
          </section>
        )}
      </div>

      <aside className="lg:w-56 lg:shrink-0">
        <WorkforceRail states={railStates(data.steps)} />
      </aside>
    </div>
  );
}
