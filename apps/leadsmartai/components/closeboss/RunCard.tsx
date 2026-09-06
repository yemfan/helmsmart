"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { AssistantAvatar } from "@/components/closeboss/AssistantAvatar";
import { ASSIGNEE_PERSONA } from "@/lib/closeboss/assigneePersona";
import { MarkdownLite } from "@/components/ui/MarkdownLite";

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
    /**
     * The localised form of `summary`. `summary` itself is written for the
     * MODEL and stays English; this is the one a person reads.
     */
    display?: { key?: string; params?: Record<string, string | number> };
    artifactUrl?: string | null;
    reason?: string;
    error?: string;
    proposal?: { draft_id?: string; channel?: string } & Record<string, unknown>;
  } | null;
  status: string;
  approval_state: string;
  error: string | null;
  /** The teammate who ran this step (from the tool's assignee). */
  assignee?: string | null;
  created_at?: string | null;
  finished_at?: string | null;
};

// The roster moved to lib/closeboss/assigneePersona so the model prompt reads
// the same names this badge renders — see that file for why.

function fmtDuration(start?: string | null, end?: string | null): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

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
  started_at?: string | null;
  finished_at?: string | null;
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
  create_avatar_video: "Avatar video",
  import_contacts_from_file: "Import contacts",
  query_crm: "CRM lookup",
  get_market_snapshot: "Market snapshot",
};

const LIVE = new Set(["planning", "running", "awaiting_approval"]);

/**
 * Tools that only READ. A run whose completed steps are all of this kind (or
 * that ran no steps at all — Max just answered or asked a question) did no
 * work for the agent, so it must not be framed as a mission accomplished.
 * That framing on a clarifying question was the single most-cited trust
 * problem in the 2026-09 UX audit.
 */
const READ_ONLY_TOOL = /^(get|query|list|search|find|read)_/;

function didRealWork(steps: RunStep[]): boolean {
  return steps.some(
    (s) => s.status === "completed" && (Boolean(s.output_json?.artifactUrl) || !READ_ONLY_TOOL.test(s.tool_name)),
  );
}

export default function RunCard({
  runId,
  onChanged,
}: {
  runId: string;
  onChanged?: () => void | Promise<void>;
}) {
  const { t } = useTranslation("dashboard");
  const [run, setRun] = useState<RunDetail | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dashboard/closeboss/runs/${runId}`)
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
    return <p className="text-sm text-slate-500">{t("pages.runCard.startingRun")}</p>;
  }

  const plan = run.plan_json?.plan ?? null;
  const pct = Math.min(100, Math.round((run.tool_calls / Math.max(run.max_tool_calls, 1)) * 100));
  const tokens = run.input_tokens + run.output_tokens;
  const realWork = didRealWork(steps);
  // "Done" is only true when something was done. A run that ended with Max
  // asking a question or answering one reads as a reply, not a completion.
  const displayStatus = run.status === "completed" && !realWork ? "replied" : run.status;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={displayStatus} />
        {/* Budget meter — only while the run is live. Once it has finished the
            "3/25 tools" figure is an internal budget the agent never set and
            reads as noise (or worse, as a score). */}
        {live && (
          <div className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400" title={`${tokens.toLocaleString()} / ${run.token_budget.toLocaleString()} tokens`}>
            <span>
              {t("pages.runCard.toolCalls", { used: run.tool_calls, max: run.max_tool_calls })}
            </span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span className="block h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
            </span>
          </div>
        )}
      </div>

      {plan && live && <div className="text-xs text-slate-600 dark:text-slate-400"><MarkdownLite text={plan} /></div>}

      {steps.length > 0 && (
        <ol className="space-y-1">
          {steps.map((s) => (
            <StepRow key={s.step_index} step={s} runId={run.id} onChanged={async () => { await load(); await onChanged?.(); }} />
          ))}
        </ol>
      )}

      {run.status === "running" && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" /> working…
        </p>
      )}

      {run.status === "completed" && realWork ? (
        <MissionCompleteCard run={run} steps={steps} />
      ) : (
        run.report && (
          <div className="rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2.5 text-sm text-slate-800 dark:text-slate-200">
            <MarkdownLite text={run.report} />
          </div>
        )
      )}
      {run.status === "failed" && run.error && (
        <p className="text-xs text-red-600">{t("pages.dashFragments.runFailed")} {run.error}</p>
      )}
      {run.status === "budget_exceeded" && (
        <p className="text-xs text-amber-700">{t("pages.runCard.stoppedAtBudget")}</p>
      )}
    </div>
  );
}

/**
 * The premium mission-complete card — the payoff moment. Instead of dumping the
 * report in a gray box, it frames the finish like a real team delivering: Max's
 * headline + a subtle five-star flourish, the crew who did the work (avatars),
 * how long the whole mission took, the deliverables, and Max's report (which
 * already ends with his proactive next step). Restrained, not confetti — the
 * "premium" cue is the gold stars + soft emerald wash, nothing that flashes.
 */
function MissionCompleteCard({ run, steps }: { run: RunDetail; steps: RunStep[] }) {
  const { t } = useTranslation("dashboard");
  const done = steps.filter((s) => s.status === "completed");

  // Crew credit — the distinct AI employees who completed a step, in order.
  const crew: { name: string; avatar: string }[] = [];
  const seen = new Set<string>();
  for (const s of done) {
    const p = s.assignee ? ASSIGNEE_PERSONA[s.assignee] : null;
    if (p && !seen.has(p.name)) {
      seen.add(p.name);
      crew.push({ name: p.name, avatar: p.avatar });
    }
  }

  const total = fmtDuration(run.started_at, run.finished_at);
  const deliverables = done
    .map((s) => ({ url: s.output_json?.artifactUrl ?? null, label: TOOL_LABEL[s.tool_name] ?? s.tool_name }))
    .filter((d): d is { url: string; label: string } => Boolean(d.url));

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50/80 to-white">
      {/* headline row */}
      <div className="flex items-start gap-2.5 px-3 pt-3">
        <AssistantAvatar id="max" size={30} alt="Max" className="mt-0.5 h-[30px] w-[30px]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.runCard.missionAccomplished")}</p>
            <span className="text-xs tracking-tight text-amber-500" aria-label={t("pages.runCard.fiveStars")}>★★★★★</span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
            <span className="font-medium text-emerald-700">
              {t("pages.runCard.stepsComplete", { count: done.length })}
            </span>
            {total && <span>· ⏱ {total}</span>}
          </p>
        </div>
      </div>

      {/* crew credit */}
      {crew.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-slate-400">{t("pages.runCard.deliveredBy")}</span>
          <span className="flex items-center gap-1.5">
            {crew.map((c) => (
              <span key={c.name} className="inline-flex items-center gap-1 rounded-full bg-white dark:bg-slate-900/80 px-1.5 py-0.5 ring-1 ring-emerald-100">
                <AssistantAvatar id={c.avatar} size={16} alt={c.name} className="h-4 w-4" />
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{c.name}</span>
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Max's report — his voice, already ending with a proactive next step */}
      {run.report && (
        <div className="px-3 pt-2.5 text-sm text-slate-800 dark:text-slate-200">
          <MarkdownLite text={run.report} />
        </div>
      )}

      {/* deliverables */}
      {deliverables.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
          {deliverables.map((d, i) => (
            <Link
              key={`${d.url}-${i}`}
              href={d.url}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              {d.label} →
            </Link>
          ))}
        </div>
      )}

      <div className="h-3" />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    planning: { label: "Planning", cls: "bg-blue-50 text-blue-700" },
    running: { label: "Working", cls: "bg-blue-50 text-blue-700" },
    awaiting_approval: { label: "Needs your approval", cls: "bg-amber-100 text-amber-800" },
    completed: { label: "Done", cls: "bg-emerald-50 text-emerald-700" },
    replied: { label: "Replied", cls: "bg-slate-100 text-slate-600" },
    failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
    budget_exceeded: { label: "Budget reached", cls: "bg-amber-50 text-amber-700" },
    cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
  };
  const m = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-500" };
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
  const { t } = useTranslation("dashboard");
  const label = TOOL_LABEL[step.tool_name] ?? step.tool_name;
  const out = step.output_json;
  const persona = step.assignee ? ASSIGNEE_PERSONA[step.assignee] : null;
  const duration = step.status === "completed" ? fmtDuration(step.created_at, step.finished_at) : null;
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
          : "text-slate-400";

  return (
    <li className="rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-xs font-bold ${iconCls}`} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {persona ? (
              <>
                <AssistantAvatar id={persona.avatar} size={18} alt={persona.name} className="h-[18px] w-[18px]" />
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{persona.name}</span>
                <span className="truncate text-[10px] text-slate-600 dark:text-slate-400">· {persona.role}</span>
              </>
            ) : (
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{label}</span>
            )}
            {duration && <span className="ml-auto shrink-0 text-[10px] font-medium text-slate-400">{duration}</span>}
          </div>
          {persona && <p className="mt-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">{label}</p>}
          {/*
            Prefer the localised form. Steps recorded before `display` existed
            have only `summary`, and English is a better answer there than a
            blank line — the alternative would hide history from anyone who
            switched language after the fact.
          */}
          {(out?.display?.key || out?.summary) && (
            <p className="text-[11px] text-slate-500">
              {out?.display?.key
                ? t(`tools.${out.display.key}`, { ...(out.display.params ?? {}), defaultValue: out.summary ?? "" })
                : out?.summary}
            </p>
          )}
          {out?.reason && step.status === "rejected" && (
            <p className="text-[11px] text-slate-400">{out.reason}</p>
          )}
          {(step.error || out?.error) && (
            <p className="text-[11px] text-red-500">{step.error ?? out?.error}</p>
          )}
          {out?.artifactUrl && (
            <Link href={out.artifactUrl} className="text-[11px] font-medium text-blue-600 hover:underline">
              {t("pages.runCard.viewDeliverable")}
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
  const { t } = useTranslation("dashboard");
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
      const res = await fetch(`/api/dashboard/closeboss/runs/${runId}/decision`, {
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
    <div className="mt-1.5 border-t border-slate-100 dark:border-slate-700 pt-1.5">
      {editing && (
        <textarea
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          rows={3}
          className="mb-1.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-xs"
          placeholder={t("pages.runCard.editBeforeSending")}
        />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("approved")}
          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === "approved" ? t("common:status.sending") : editing ? t("pages.run.saveSend") : t("pages.bossAssistant.approveSend")}
        </button>
        {draftId && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >{t("pages.runCard.edit")}</button>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("rejected")}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          {busy === "rejected" ? t("common:status.rejecting") : t("common:actions.reject")}
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
