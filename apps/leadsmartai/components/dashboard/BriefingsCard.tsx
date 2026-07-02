"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Send, Sparkles } from "lucide-react";
import { useAssistantNames } from "@/components/realtyboss/useAssistantNames";

/**
 * The Boss dashboard's briefing band:
 *
 *   - Morning Briefing (☀️) with a "Mark as read" button — once read,
 *     the card hides until the next morning's briefing arrives.
 *   - Boss Instructions — a free-form channel to the Boss Assistant.
 *     It checks every 5 minutes, turns instructions into a task list,
 *     assigns each task to the AI assistant that can do it, and
 *     leaves the rest for the Realtor to review (mirrored into Tasks).
 *
 * The evening summary is retired — this instruction channel lives in
 * its old spot.
 */

type BriefingInsights = {
  topHotLeads?: Array<{ name: string; score: number; address: string }>;
  needsFollowUp?: Array<{ name: string; daysInactive: number; address: string }>;
  topOpportunity?: string;
  suggestedActions?: string[];
};

type BriefingRow = {
  id: string;
  kind: "morning" | "evening";
  headline: string | null;
  summary: string;
  insights: BriefingInsights;
  created_at: string;
  read_at: string | null;
};

type InstructionRow = {
  id: string;
  content: string;
  status: "pending" | "processing" | "done" | "failed";
  error: string | null;
  processed_at: string | null;
  created_at: string;
};

type InstructionTask = {
  id: string;
  instruction_id: string;
  title: string;
  details: string | null;
  assigned_to:
    | "receptionist"
    | "sales_assistant"
    | "marketing_assistant"
    | "transaction_assistant"
    | "accountant"
    | "realtor";
  status:
    | "assigned"
    | "needs_review"
    | "needs_input"
    | "awaiting_approval"
    | "sent"
    | "completed"
    | "done"
    | "dismissed"
    | "failed";
  draft_channel: "sms" | "email" | null;
  draft_subject: string | null;
  draft_body: string | null;
  execution_note: string | null;
  action_type: string | null;
  follow_up_question: string | null;
  artifact_type: string | null;
  artifact_url: string | null;
  created_at: string;
};

const ASSIGNEE_LABELS: Record<InstructionTask["assigned_to"], string> = {
  receptionist: "Receptionist",
  sales_assistant: "Sales Assistant",
  marketing_assistant: "Marketing Assistant",
  transaction_assistant: "Transaction Assistant",
  accountant: "Accountant",
  realtor: "For your review",
};

export default function BriefingsCard() {
  return (
    <section aria-label="Briefing and instructions" className="grid gap-4 lg:grid-cols-2">
      <MorningBriefingPane />
      <BossInstructionsPane />
    </section>
  );
}

// ── Morning briefing (dismissible) ──────────────────────────────────

function MorningBriefingPane() {
  const [briefing, setBriefing] = useState<BriefingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/dashboard/briefings?limit=1")
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        const latest = (json?.morning?.[0] ?? null) as BriefingRow | null;
        setBriefing(latest);
        setHidden(Boolean(latest?.read_at));
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function markRead() {
    if (!briefing) return;
    setHidden(true); // optimistic — the card folds immediately
    try {
      await fetch("/api/dashboard/briefings/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: briefing.id }),
      });
    } catch {
      // Worst case it reappears next load.
    }
  }

  if (!loading && (hidden || !briefing)) {
    // Read (or none yet): a quiet one-liner instead of an empty box.
    return (
      <article className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 px-4 py-3">
        <span aria-hidden>☀️</span>
        <p className="text-xs text-slate-400">
          {briefing
            ? "Morning briefing read — the next one arrives tomorrow."
            : "Your first morning briefing arrives at your scheduled time."}
        </p>
      </article>
    );
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 via-white to-white p-5 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-xl" aria-hidden>
            ☀️
          </span>
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Morning Briefing</h3>
            <p className="text-[11px] text-slate-500">
              {briefing ? formatRelativeDate(briefing.created_at) : ""}
            </p>
          </div>
        </div>
        {briefing && (
          <button
            type="button"
            onClick={markRead}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 shadow-sm hover:bg-amber-50"
          >
            <Check className="h-3 w-3" strokeWidth={2.5} />
            Mark as read
          </button>
        )}
      </header>

      <div className="mt-4 min-h-[5rem]">
        {loading ? (
          <SkeletonBody />
        ) : briefing ? (
          <BriefingBody row={briefing} />
        ) : null}
      </div>
    </article>
  );
}

function BriefingBody({ row }: { row: BriefingRow }) {
  const insights = row.insights ?? {};
  const headline = row.headline?.trim() || row.summary.split(/[.!?]\s/)[0] || "";
  return (
    <>
      <p className="text-base font-semibold leading-snug text-slate-900">{headline}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{row.summary}</p>
      {insights.topOpportunity ? (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-inset ring-amber-200">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
            <Sparkles className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Best move
          </p>
          <p className="mt-1 text-sm leading-snug">{insights.topOpportunity}</p>
        </div>
      ) : null}
    </>
  );
}

// ── Boss instructions channel ───────────────────────────────────────

function BossInstructionsPane() {
  const [content, setContent] = useState("");
  const [instructions, setInstructions] = useState<InstructionRow[]>([]);
  const [tasks, setTasks] = useState<InstructionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/dashboard/realtyboss/instructions?limit=3")
      .then((r) => r.json())
      .catch(() => ({}));
    setInstructions((res?.instructions ?? []) as InstructionRow[]);
    setTasks((res?.tasks ?? []) as InstructionTask[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Instructions process immediately on Send (the cron is just the
  // safety net) — poll every few seconds while one is in flight so
  // the routed task list appears as soon as the Boss finishes.
  const hasPending = instructions.some((i) => i.status === "pending" || i.status === "processing");
  useEffect(() => {
    if (!hasPending) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(() => void load(), 4_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hasPending, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = content.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/dashboard/realtyboss/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      }).then((r) => r.json());
      if (res?.ok) {
        setContent("");
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-[#0B1F44]/15 bg-gradient-to-br from-slate-50/80 via-white to-white p-5 shadow-sm">
      <header className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B1F44]/5 text-xl" aria-hidden>
          📋
        </span>
        <div>
          <h3 className="text-sm font-semibold text-[#0B1F44]">Instructions for your Boss Assistant</h3>
          <p className="text-[11px] text-slate-500">
            Processed the moment you hit Send — turned into tasks and routed to your team.
          </p>
        </div>
      </header>

      <form onSubmit={submit} className="mt-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder='e.g. "Text Jane about Saturday, schedule a just-listed post for Rosewood Dr, and chase the Hillcrest referral fee."'
          maxLength={4000}
          rows={2}
          className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B1F44] focus:outline-none"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#142c5c] disabled:opacity-50"
          >
            <Send className="h-3 w-3" strokeWidth={2.5} />
            {submitting ? "Sending…" : "Send to Boss Assistant"}
          </button>
        </div>
      </form>

      <div className="mt-2 space-y-3">
        {loading ? (
          <SkeletonBody />
        ) : instructions.length === 0 ? null : (
          instructions.map((ins) => (
            <InstructionItem
              key={ins.id}
              instruction={ins}
              tasks={tasks.filter((t) => t.instruction_id === ins.id)}
              onChanged={load}
            />
          ))
        )}
      </div>
    </article>
  );
}

function InstructionItem({
  instruction,
  tasks,
  onChanged,
}: {
  instruction: InstructionRow;
  tasks: InstructionTask[];
  onChanged: () => void | Promise<void>;
}) {
  const statusLine =
    instruction.status === "pending" || instruction.status === "processing"
      ? "Your Boss Assistant is on it — breaking this into tasks…"
      : instruction.status === "failed"
        ? "Couldn't process this one — try rephrasing it."
        : null;

  return (
    <div className="rounded-lg border border-slate-100 bg-white/70 p-3">
      <p className="text-xs italic text-slate-500">&ldquo;{truncate(instruction.content, 140)}&rdquo;</p>
      {statusLine ? (
        <p className={`mt-1.5 text-[11px] ${instruction.status === "failed" ? "text-red-600" : "text-slate-400"}`}>
          {statusLine}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {tasks.map((t) => (
            <TaskItem key={t.id} task={t} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskItem({
  task: t,
  onChanged,
}: {
  task: InstructionTask;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<"approve" | "dismiss" | "answer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const assistantNames = useAssistantNames();

  async function act(action: "approve" | "dismiss" | "answer") {
    if (action === "answer" && !answer.trim()) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/realtyboss/instruction-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "answer" ? { id: t.id, action, answer: answer.trim() } : { id: t.id, action },
        ),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error || "Action failed.");
      setAnswer("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-slate-800">
            {(t.status === "sent" || t.status === "completed") && (
              <span className="mr-1 text-emerald-600">✓</span>
            )}
            {t.status === "dismissed" && <span className="mr-1 text-slate-400">✕</span>}
            {t.title}
          </p>
          {t.details && <p className="truncate text-[11px] text-slate-400">{t.details}</p>}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            t.status === "sent" || t.status === "completed"
              ? "bg-emerald-50 text-emerald-700"
              : t.status === "needs_input" || t.assigned_to === "realtor"
                ? "bg-amber-50 text-amber-800"
                : "bg-[#0B1F44]/5 text-[#0B1F44]"
          }`}
        >
          {t.status === "sent"
            ? "Sent"
            : t.status === "completed"
              ? "Done"
              : t.status === "needs_input"
                ? "Needs info"
                : assistantNames[t.assigned_to] ?? ASSIGNEE_LABELS[t.assigned_to]}
        </span>
      </div>

      {/* The assistant's draft — the approval moment. Nothing sends
          without this click. */}
      {t.status === "awaiting_approval" && t.draft_body && (
        <div className="mt-1.5 rounded-lg border border-[#D4A017]/30 bg-[#D4A017]/5 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a6a0e]">
            Draft {t.draft_channel === "sms" ? "text" : "email"}
            {t.execution_note && !t.execution_note.startsWith("to:") ? ` · ${t.execution_note}` : ""}
          </p>
          {t.draft_subject && (
            <p className="mt-1 text-xs font-medium text-slate-800">{t.draft_subject}</p>
          )}
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{t.draft_body}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => act("approve")}
              className="rounded-lg bg-[#0B1F44] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#142c5c] disabled:opacity-50"
            >
              {busy === "approve" ? "Sending…" : "Approve & send"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => act("dismiss")}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Dismiss
            </button>
            {error && <span className="text-[11px] text-red-600">{error}</span>}
          </div>
        </div>
      )}

      {/* Follow-up question — the Boss needs a missing detail (e.g. the
          property address) before it can run the action. */}
      {t.status === "needs_input" && (
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
          <p className="text-xs text-amber-900">
            {t.follow_up_question ?? "Your Boss Assistant needs one more detail to start this."}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void act("answer");
                }
              }}
              placeholder="Type your answer…"
              className="min-w-0 flex-1 rounded-lg border border-amber-200 px-2.5 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B1F44] focus:outline-none"
            />
            <button
              type="button"
              disabled={busy !== null || !answer.trim()}
              onClick={() => act("answer")}
              className="shrink-0 rounded-lg bg-[#0B1F44] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#142c5c] disabled:opacity-50"
            >
              {busy === "answer" ? "Working…" : "Send to Boss"}
            </button>
          </div>
          {error && <span className="mt-1 block text-[11px] text-red-600">{error}</span>}
        </div>
      )}

      {/* Completed action — a result note + a link to the deliverable when
          there is one (CMA/presentation); playbooks + queued calls show the
          note alone. */}
      {t.status === "completed" && (
        <div className="mt-1.5">
          {t.execution_note && <p className="text-[11px] text-slate-500">{t.execution_note}</p>}
          {t.artifact_url && (
            <a
              href={t.artifact_url}
              className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#0B1F44] hover:underline"
            >
              View {t.artifact_type === "cma" ? "CMA" : t.artifact_type === "presentation" ? "presentation" : "result"} →
            </a>
          )}
        </div>
      )}
    </li>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────

function SkeletonBody() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 w-3/4 rounded bg-slate-200" />
      <div className="h-3 w-full rounded bg-slate-100" />
      <div className="h-3 w-5/6 rounded bg-slate-100" />
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((today.getTime() - date.setHours(0, 0, 0, 0)) / dayMs);
  const t = new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diffDays <= 0) return `Today, ${t}`;
  if (diffDays === 1) return `Yesterday, ${t}`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
