"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * Live Boss v2 run card (HANDOFF_BOSS_V2 PR-4): plan + step timeline with
 * streaming status, deliverable links, a tool/token budget meter, and
 * approve / edit / reject cards for steps parked pending approval.
 *
 * Self-polling: refreshes every 3.5s while the run is live, stops on terminal
 * status. Parent gets onChanged() after decisions so surrounding state (tasks,
 * activities) can refresh too.
 */

type RunStep = {
  step_index: number;
  tool_name: string;
  risk_class: string;
  input_json: Record<string, unknown> | null;
  output_json: {
    status?: string;
    summary?: string;
    artifactUrl?: string | null;
    reason?: string;
    error?: string;
    proposal?: { draft_id?: string; channel?: string } & Record<string, unknown>;
  } | null;
  status: string;
  approval_state: string;
  error: string | null;
};

type RunDetail = {
  id: string;
  status: string;
  objective: string;
  plan_json: { plan?: string } | null;
  report: string | null;
  error: string | null;
  tool_calls: number;
  max_tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  token_budget: number;
};

const TOOL_LABEL: Record<string, string> = {
  run_cma: "CMA",
  house_search: "House search",
  generate_seller_presentation: "Seller presentation",
  generate_deep_report: "Deep report",
  draft_message: "Draft message",
  send_message: "Send message",
  schedule_voice_call: "AI voice call",
  create_task: "Task",
  create_calendar_event: "Calendar event",
  publish_social_post: "Social post",
  schedule_social_post: "Scheduled social post",
  query_crm: "CRM lookup",
  get_market_snapshot: "Market snapshot",
};

const LIVE = new Set(["planning", "running", "awaiting_approval"]);

export default function RunCard({
  runId,
  onChanged,
}: {
  runId: string;
  onChanged?: () => void | Promise<void>;
}) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dashboard/realtyboss/runs/${runId}`)
      .then((r) => r.json())
      .catch(() => null);
    if (res?.ok) {
      setRun(res.run as RunDetail);
      setSteps((res.steps ?? []) as RunStep[]);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const live = run ? LIVE.has(run.status) : true;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void load(), 3500);
    return () => clearInterval(t);
  }, [live, load]);

  if (!run) {
    return <p className="text-sm text-gray-500">Starting the run…</p>;
  }

  const plan = run.plan_json?.plan ?? null;
  const pct = Math.min(100, Math.round((run.tool_calls / Math.max(run.max_tool_calls, 1)) * 100));
  const tokens = run.input_tokens + run.output_tokens;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={run.status} />
        {/* budget meter */}
        <div className="flex items-center gap-2 text-[10px] text-gray-400" title={`${tokens.toLocaleString()} / ${run.token_budget.toLocaleString()} tokens`}>
          <span>
            {run.tool_calls}/{run.max_tool_calls} tools
          </span>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
            <span className="block h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
          </span>
        </div>
      </div>

      {plan && <p className="whitespace-pre-line text-xs text-gray-600">{plan}</p>}

      {steps.length > 0 && (
        <ol className="space-y-1">
          {steps.map((s) => (
            <StepRow key={s.step_index} step={s} runId={run.id} onChanged={async () => { await load(); await onChanged?.(); }} />
          ))}
        </ol>
      )}

      {run.status === "running" && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" /> working…
        </p>
      )}

      {run.report && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
          <p className="whitespace-pre-line text-sm text-gray-800">{run.report}</p>
        </div>
      )}
      {run.status === "failed" && run.error && (
        <p className="text-xs text-red-600">Run failed: {run.error}</p>
      )}
      {run.status === "budget_exceeded" && (
        <p className="text-xs text-amber-700">Stopped at the run budget — partial work above.</p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    planning: { label: "Planning", cls: "bg-blue-50 text-blue-700" },
    running: { label: "Working", cls: "bg-blue-50 text-blue-700" },
    awaiting_approval: { label: "Needs your approval", cls: "bg-amber-100 text-amber-800" },
    completed: { label: "Done", cls: "bg-emerald-50 text-emerald-700" },
    failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
    budget_exceeded: { label: "Budget reached", cls: "bg-amber-50 text-amber-700" },
    cancelled: { label: "Cancelled", cls: "bg-gray-100 text-gray-500" },
  };
  const m = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>{m.label}</span>;
}

function StepRow({
  step,
  runId,
  onChanged,
}: {
  step: RunStep;
  runId: string;
  onChanged: () => Promise<void>;
}) {
  const label = TOOL_LABEL[step.tool_name] ?? step.tool_name;
  const out = step.output_json;
  const icon =
    step.status === "completed"
      ? "✓"
      : step.status === "pending_approval"
        ? "⏸"
        : step.status === "running"
          ? "…"
          : step.status === "rejected"
            ? "—"
            : "✕";
  const iconCls =
    step.status === "completed"
      ? "text-emerald-600"
      : step.status === "pending_approval"
        ? "text-amber-600"
        : step.status === "failed"
          ? "text-red-500"
          : "text-gray-400";

  return (
    <li className="rounded-lg border border-gray-100 bg-white px-2.5 py-1.5">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-xs font-bold ${iconCls}`} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-800">{label}</p>
          {out?.summary && <p className="text-[11px] text-gray-500">{out.summary}</p>}
          {out?.reason && step.status === "rejected" && (
            <p className="text-[11px] text-gray-400">{out.reason}</p>
          )}
          {(step.error || out?.error) && (
            <p className="text-[11px] text-red-500">{step.error ?? out?.error}</p>
          )}
          {out?.artifactUrl && (
            <Link href={out.artifactUrl} className="text-[11px] font-medium text-blue-600 hover:underline">
              View deliverable →
            </Link>
          )}
        </div>
      </div>
      {step.approval_state === "pending" && (
        <ApprovalControls step={step} runId={runId} onChanged={onChanged} />
      )}
    </li>
  );
}

/** Approve / edit / reject for a parked outbound step. Editing a send_message
 *  proposal PATCHes the underlying draft first, so approve sends the edit. */
function ApprovalControls({
  step,
  runId,
  onChanged,
}: {
  step: RunStep;
  runId: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const draftId = step.output_json?.proposal?.draft_id ?? null;

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    setError(null);
    try {
      if (decision === "approved" && editing && editBody.trim() && draftId) {
        const edit = await fetch(`/api/dashboard/drafts/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "edit", body: editBody.trim() }),
        }).then((r) => r.json());
        if (!edit?.ok) throw new Error(edit?.error || "Couldn't save the edit.");
      }
      const res = await fetch(`/api/dashboard/realtyboss/runs/${runId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepIndex: step.step_index, decision }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error || "Decision failed.");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-1.5 border-t border-gray-100 pt-1.5">
      {editing && (
        <textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          rows={3}
          className="mb-1.5 w-full rounded-lg border border-gray-200 p-2 text-xs"
          placeholder="Edit the message before sending…"
        />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("approved")}
          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === "approved" ? "Sending…" : editing ? "Save & send" : "Approve & send"}
        </button>
        {draftId && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("rejected")}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-400 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === "rejected" ? "Rejecting…" : "Reject"}
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
