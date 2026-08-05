"use client";

import Link from "next/link";
import nextDynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI_TEAM } from "@/lib/realtyboss/team";
import { LeadProfileDrawer } from "@/components/realtyboss/LeadProfileDrawer";
import { AssistantAvatar } from "@/components/realtyboss/AssistantAvatar";
import RunCard from "@/components/realtyboss/RunCard";

/**
 * Boss Assistant — the conversational command center.
 *
 * The Boss leads with a briefing, then PROPOSES concrete actions and INITIATES
 * them: each proposal carries a real action it can run via the instruction
 * pipeline (POST /instructions → routed, drafted tasks → approve/answer/dismiss
 * on /instruction-tasks). The approval moment is the control point — nothing
 * outbound sends without it unless the matching autopilot cell is "auto".
 *
 * Layout = one conversation:
 *   header (Boss identity · autopilot · settings) → context strip (clickable) →
 *   thread (briefing · what the team did · proposals · live task replies) →
 *   command bar → AI team → performance.
 */

// ── shapes ───────────────────────────────────────────────────────────

type SummaryMetrics = { totalLeads: number; hotLeads: number; inactive7Days: number; messagesSent: number };
type EventItem = { id: string; title: string; lead_name: string | null; starts_at: string };
type HotLead = {
  id: string;
  name: string | null;
  source: string | null;
  engagement_score: number | null;
  last_activity_at: string | null;
  ai_intent: string | null;
};
type TransactionItem = {
  id: string;
  property_address: string;
  status: string;
  inspection_deadline: string | null;
  inspection_completed_at: string | null;
  appraisal_deadline: string | null;
  appraisal_completed_at: string | null;
  loan_contingency_deadline: string | null;
  loan_contingency_removed_at: string | null;
  closing_date: string | null;
};
type Recommendation = {
  id: string;
  title: string;
  summary: string | null;
  reason: string | null;
  recommended_action: string | null;
  action_href: string | null;
  expected_outcome: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
};
type ActivityRow = {
  id: string;
  assistant_type: string;
  activity_type: string;
  summary: string;
  outcome: string | null;
  requires_attention: boolean;
  created_at: string;
};
type BriefingRow = { id: string; headline: string | null; summary: string; insights: { topOpportunity?: string }; read_at: string | null };

type AssigneeKey =
  | "receptionist"
  | "sales_assistant"
  | "marketing_assistant"
  | "transaction_assistant"
  | "accountant"
  | "realtor"
  | "boss_assistant";

type InstructionRow = { id: string; content: string; status: "pending" | "processing" | "done" | "failed"; clarification?: string | null; created_at: string };
type TaskRow = {
  id: string;
  instruction_id: string;
  title: string;
  details: string | null;
  assigned_to: AssigneeKey;
  status: "assigned" | "needs_review" | "needs_input" | "awaiting_approval" | "scheduled" | "sent" | "completed" | "done" | "dismissed" | "failed";
  draft_channel: "sms" | "email" | null;
  draft_subject: string | null;
  draft_body: string | null;
  execution_note: string | null;
  follow_up_question: string | null;
  artifact_type: string | null;
  artifact_url: string | null;
  created_at: string;
};

type Channel = "call" | "sms" | "email" | "social";
type AutopilotCell = { assignee: string; channel: Channel; mode: "ask" | "auto" };
type AutopilotChannels = { assignee: string; channels: Channel[] };

/** Boss v2 live run (see /api/dashboard/realtyboss/runs). */
type RunRow = {
  id: string;
  instruction_id: string | null;
  trigger: "command" | "overnight" | "retry";
  status: "planning" | "running" | "awaiting_approval" | "completed" | "failed" | "budget_exceeded" | "cancelled";
  objective: string;
  started_at: string;
};
const LIVE_RUN_STATUSES = new Set(["planning", "running", "awaiting_approval"]);

const ASSIGNEE_LABEL: Record<string, string> = {
  receptionist: "Receptionist",
  sales_assistant: "Sales Assistant",
  marketing_assistant: "Marketing Assistant",
  transaction_assistant: "Transaction Assistant",
  accountant: "Accountant",
  realtor: "For your review",
  boss_assistant: "Max",
};
const CHANNEL_LABEL: Record<Channel, string> = { call: "Call", sms: "Text", email: "Email", social: "Social" };

const QUICK_COMMANDS = [
  "Text my hot leads a check-in",
  "Draft a just-listed social post",
  "Plan my day",
];

// ── helpers ──────────────────────────────────────────────────────────

function fmtAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

type DeadlineAlert = { transactionId: string; propertyAddress: string; label: string; due: Date; risk: "high" | "medium" };
function deadlineAlerts(transactions: TransactionItem[]): DeadlineAlert[] {
  const now = Date.now();
  const horizon = now + 7 * 24 * 60 * 60 * 1000;
  const alerts: DeadlineAlert[] = [];
  for (const t of transactions) {
    if (t.status !== "active" && t.status !== "pending") continue;
    const candidates = [
      { label: "Inspection contingency", date: t.inspection_deadline, done: t.inspection_completed_at },
      { label: "Appraisal deadline", date: t.appraisal_deadline, done: t.appraisal_completed_at },
      { label: "Loan contingency", date: t.loan_contingency_deadline, done: t.loan_contingency_removed_at },
      { label: "Closing", date: t.closing_date, done: null as string | null },
    ];
    for (const c of candidates) {
      if (!c.date || c.done) continue;
      const due = new Date(c.date);
      if (due.getTime() > horizon) continue;
      alerts.push({
        transactionId: t.id,
        propertyAddress: t.property_address,
        label: c.label,
        due,
        risk: due.getTime() < now + 3 * 24 * 60 * 60 * 1000 ? "high" : "medium",
      });
    }
  }
  return alerts.sort((a, b) => a.due.getTime() - b.due.getTime());
}

// ── main ─────────────────────────────────────────────────────────────

export default function BossAssistantClient({ greetingName }: { greetingName: string }) {
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [hotLeads, setHotLeads] = useState<HotLead[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [briefing, setBriefing] = useState<BriefingRow | null>(null);
  const [instructions, setInstructions] = useState<InstructionRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [teamStatus, setTeamStatus] = useState<Record<string, "active" | "paused">>({});
  const [teamAvatars, setTeamAvatars] = useState<Record<string, { id: string; url: string | null }>>({});

  const [autopilot, setAutopilot] = useState(false);
  const [autopilotCells, setAutopilotCells] = useState<AutopilotCell[]>([]);
  const [autopilotChannels, setAutopilotChannels] = useState<AutopilotChannels[]>([]);
  const [overnightMode, setOvernightMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [profileLeadId, setProfileLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadConversation = useCallback(async () => {
    const [res, runsRes] = await Promise.all([
      fetch("/api/dashboard/realtyboss/instructions?limit=8").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/realtyboss/runs?limit=12").then((r) => r.json()).catch(() => ({})),
    ]);
    setInstructions(((res?.instructions ?? []) as InstructionRow[]).slice().reverse());
    setTasks((res?.tasks ?? []) as TaskRow[]);
    setRuns((runsRes?.runs ?? []) as RunRow[]);
  }, []);

  const loadData = useCallback(async () => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

    const [summaryRes, eventsRes, hotRes, txRes, recsRes, actsRes, teamRes, briefRes, apRes] = await Promise.all([
      fetch("/api/dashboard/summary").then((r) => r.json()).catch(() => ({})),
      fetch(`/api/dashboard/calendar/events?from=${todayStart}&to=${todayEnd}`).then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/leads?filter=hot&pageSize=5").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/transactions").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/realtyboss/recommendations").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/realtyboss/activities?limit=40").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/realtyboss/team").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/briefings?limit=1").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/realtyboss/autopilot").then((r) => r.json()).catch(() => ({})),
    ]);

    const m = summaryRes?.metrics;
    if (m) setMetrics({ totalLeads: m.totalLeads ?? 0, hotLeads: m.hotLeads ?? 0, inactive7Days: m.inactive7Days ?? 0, messagesSent: m.messagesSent ?? 0 });
    setEvents(((eventsRes?.events ?? []) as EventItem[]).slice(0, 8));
    setHotLeads(((hotRes?.leads ?? []) as HotLead[]).slice(0, 8));
    setTransactions((txRes?.transactions ?? []) as TransactionItem[]);
    setRecommendations((recsRes?.recommendations ?? []) as Recommendation[]);
    setActivities((actsRes?.activities ?? []) as ActivityRow[]);
    const morning = (briefRes?.morning?.[0] ?? null) as BriefingRow | null;
    setBriefing(morning && !morning.read_at ? morning : null);

    // Names always come from the roster persona (the profile) — not a per-tenant override.
    const names: Record<string, string> = Object.fromEntries(AI_TEAM.map((d) => [d.type, d.displayName]));
    const statuses: Record<string, "active" | "paused"> = {};
    const avatars: Record<string, { id: string; url: string | null }> = {};
    for (const a of (teamRes?.assistants ?? []) as { type: string; status: "active" | "paused"; avatar_id?: string; avatar_url?: string | null }[]) {
      statuses[a.type] = a.status;
      if (a.avatar_id) avatars[a.type] = { id: a.avatar_id, url: a.avatar_url ?? null };
    }
    setTeamNames(names);
    setTeamStatus(statuses);
    setTeamAvatars(avatars);

    if (apRes?.ok) {
      setAutopilot(Boolean(apRes.global));
      setAutopilotCells((apRes.cells ?? []) as AutopilotCell[]);
      setAutopilotChannels((apRes.channels ?? []) as AutopilotChannels[]);
      setOvernightMode(Boolean(apRes.overnightMode));
    }

    await loadConversation();
    setLoading(false);
  }, [loadConversation]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Poll the conversation while an instruction is still being parsed/routed
  // or a Boss v2 run is live (RunCard self-polls its own detail; this keeps
  // the surrounding lists fresh).
  const hasPending =
    instructions.some((i) => i.status === "pending" || i.status === "processing") ||
    runs.some((r) => LIVE_RUN_STATUSES.has(r.status));
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => void loadConversation(), 4000);
    return () => clearInterval(t);
  }, [hasPending, loadConversation]);

  // Deep-link prefill: /dashboard/boss?ask=<prompt> (launched from the welcome
  // page's "Ask Max" prompts) seeds the command bar once, then we strip the
  // param so a refresh doesn't re-inject it.
  const [askPrefill, setAskPrefill] = useState("");
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("ask");
      if (q && q.trim()) {
        setAskPrefill(q);
        const url = new URL(window.location.href);
        url.searchParams.delete("ask");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* ignore */
    }
  }, []);

  const submitCommand = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content) return;

    // If the Boss is waiting on a missing detail, treat what the Realtor types
    // in the command bar as the ANSWER to the most recent open question — not a
    // brand-new instruction. This is what makes multi-turn slot-filling work:
    // "set up an open house" → "what address?" → "4521 Rosewood Dr" continues
    // the same task instead of restarting the plan from scratch each turn.
    const pending = tasks
      .filter((t) => t.status === "needs_input")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (pending) {
      await fetch("/api/dashboard/realtyboss/instruction-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pending.id, action: "answer", answer: content }),
      }).catch(() => {});
      await loadConversation();
      return;
    }

    // Optimistic instruction bubble so the conversation reacts instantly.
    const tempId = `temp_${Date.now()}`;
    setInstructions((prev) => [...prev, { id: tempId, content, status: "processing", created_at: new Date().toISOString() }]);
    await fetch("/api/dashboard/realtyboss/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }).catch(() => {});
    await loadConversation();
  }, [loadConversation, tasks]);

  const resolveRecommendation = useCallback(async (id: string, status: "completed" | "dismissed") => {
    setRecommendations((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/dashboard/realtyboss/recommendations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }, []);

  const setGlobalAutopilot = useCallback(async (on: boolean) => {
    setAutopilot(on);
    await fetch("/api/dashboard/realtyboss/autopilot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ global: on }),
    }).catch(() => setAutopilot(!on));
  }, []);

  const setCell = useCallback(async (assignee: string, channel: Channel, mode: "ask" | "auto") => {
    setAutopilotCells((prev) => {
      const next = prev.filter((c) => !(c.assignee === assignee && c.channel === channel));
      return [...next, { assignee, channel, mode }];
    });
    await fetch("/api/dashboard/realtyboss/autopilot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee, channel, mode }),
    }).catch(() => {});
  }, []);

  const toggleOvernight = useCallback(async (on: boolean) => {
    setOvernightMode(on);
    await fetch("/api/dashboard/realtyboss/autopilot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overnightMode: on }),
    }).catch(() => setOvernightMode(!on));
  }, []);

  // One tap: global off + every per-channel cell to "ask" (HANDOFF PR-4).
  const pauseAllAutonomy = useCallback(async () => {
    setAutopilot(false);
    setAutopilotCells((prev) => prev.map((c) => ({ ...c, mode: "ask" as const })));
    await fetch("/api/dashboard/realtyboss/autopilot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pauseAll: true }),
    }).catch(() => {});
  }, []);

  // Time-of-day greeting depends on the viewer's local clock — compute it on
  // the client only to avoid a hydration mismatch (#418) when the server clock
  // produces a different bucket than the browser. Seed with a clock-independent
  // default so SSR and the first client render agree.
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);

  // The most recent question the Boss is waiting on — the command bar answers
  // it directly (see submitCommand) and its placeholder reflects it.
  const pendingQuestion = useMemo(() => {
    const p = tasks
      .filter((t) => t.status === "needs_input")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    return p?.follow_up_question ?? null;
  }, [tasks]);

  const alerts = useMemo(() => deadlineAlerts(transactions), [transactions]);
  const activeDeals = useMemo(() => transactions.filter((t) => t.status === "active" || t.status === "pending"), [transactions]);

  const teamDigest = useMemo(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recent = activities.filter((a) => new Date(a.created_at).getTime() >= dayAgo);
    if (recent.length === 0) return null;
    const by = (t: string) => recent.filter((a) => a.assistant_type === t).length;
    const parts: string[] = [];
    if (by("receptionist") > 0) parts.push(`answered ${by("receptionist")} call${by("receptionist") === 1 ? "" : "s"}`);
    if (by("sales_assistant") > 0) parts.push(`sent ${by("sales_assistant")} follow-up${by("sales_assistant") === 1 ? "" : "s"}`);
    if (by("marketing_assistant") > 0) parts.push(`made ${by("marketing_assistant")} marketing touch${by("marketing_assistant") === 1 ? "" : "es"}`);
    if (by("transaction_assistant") > 0) parts.push(`flagged ${by("transaction_assistant")} transaction item${by("transaction_assistant") === 1 ? "" : "s"}`);
    const booked = recent.filter((a) => a.activity_type === "appointment_booked").length;
    if (booked > 0) parts.push(`booked ${booked} appointment${booked === 1 ? "" : "s"}`);
    if (parts.length === 0) return null;
    return { total: recent.length, line: parts.join(", "), needsYou: recent.filter((a) => a.requires_attention).length };
  }, [activities]);

  const bossName = teamNames["boss_assistant"] || "Max";
  const bossAvatar = teamAvatars["boss_assistant"] ?? null;

  return (
    <div className="space-y-4">
      {/* ── Header: Boss identity · autopilot · settings ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BossAvatar avatar={bossAvatar} />
          <div>
            <h1 className="text-lg font-semibold leading-tight text-gray-900">Ask Max</h1>
            <p className="text-xs text-gray-500">
              {bossName === "Max" ? "Captain of your AI team" : `${bossName} · captain of your AI team`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AutopilotToggle on={autopilot} onToggle={() => void setGlobalAutopilot(!autopilot)} />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            aria-label="Approval settings"
            title="Approval settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* ── Context strip (clickable → inline detail) ── */}
      <ContextStrip
        metrics={metrics}
        eventsCount={loading ? undefined : events.length}
        dealsCount={loading ? undefined : activeDeals.length}
        deadlinesCount={loading ? undefined : alerts.length}
        hotLeads={hotLeads}
        events={events}
        deals={activeDeals}
        alerts={alerts}
        onOpenLead={setProfileLeadId}
      />

      {/* ── Conversation thread ── */}
      <section className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/60 p-3 sm:p-4">
        {/* Briefing opener */}
        <BossBubble bossName={bossName} avatar={bossAvatar}>
          <p className="text-sm text-gray-800">
            {greeting}{greetingName ? `, ${greetingName}` : ""}.{" "}
            {briefing?.headline?.trim() || briefing?.summary?.split(/[.!?]\s/)[0] || "Here's where things stand — and what I'd like to do for you."}
          </p>
          {briefing?.insights?.topOpportunity && (
            <p className="mt-1.5 text-xs font-medium text-[#8a6a0e]">→ {briefing.insights.topOpportunity}</p>
          )}
          {teamDigest && (
            <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-600">
              <span className="font-semibold text-gray-800">While you were out</span>, your team {teamDigest.line}.
              {teamDigest.needsYou > 0 && (
                <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                  {teamDigest.needsYou} need{teamDigest.needsYou === 1 ? "s" : ""} you
                </span>
              )}
            </p>
          )}
        </BossBubble>

        {/* Proposals (from the recommendations engine) — propose + initiate */}
        {recommendations.map((r) => (
          <ProposalCard
            key={r.id}
            rec={r}
            bossName={bossName}
            avatar={bossAvatar}
            onHandle={() => {
              void submitCommand(r.recommended_action && r.recommended_action.length > 3 ? r.recommended_action : r.title);
              void resolveRecommendation(r.id, "completed");
            }}
            onOpenLead={r.related_entity_type === "contact" && r.related_entity_id ? () => setProfileLeadId(r.related_entity_id) : null}
            onDismiss={() => void resolveRecommendation(r.id, "dismissed")}
          />
        ))}

        {/* Approval inbox — runs paused for you that aren't in the visible
            conversation (older commands, overnight runs). */}
        {runs
          .filter((r) => r.status === "awaiting_approval" && !instructions.some((i) => i.id === r.instruction_id))
          .map((r) => (
            <BossBubble key={r.id} bossName={bossName} avatar={bossAvatar}>
              <p className="mb-1.5 text-xs text-gray-500">
                {r.trigger === "overnight" ? "From last night's run" : "Earlier command"}: {r.objective.slice(0, 120)}
              </p>
              <RunCard runId={r.id} onChanged={loadConversation} />
            </BossBubble>
          ))}

        {/* Live conversation — instructions you sent + the team's replies */}
        {instructions.map((ins) => (
          <InstructionExchange
            key={ins.id}
            instruction={ins}
            tasks={tasks.filter((t) => t.instruction_id === ins.id)}
            run={runs.find((r) => r.instruction_id === ins.id) ?? null}
            bossName={bossName}
            avatar={bossAvatar}
            teamNames={teamNames}
            onChanged={loadConversation}
          />
        ))}

        {recommendations.length === 0 && instructions.length === 0 && !loading && (
          <BossBubble bossName={bossName} avatar={bossAvatar}>
            <p className="text-sm text-gray-600">Nothing urgent — your team has things under control. Tell me what you&apos;d like done.</p>
          </BossBubble>
        )}

        <CommandBar onSubmit={submitCommand} autopilot={autopilot} pendingQuestion={pendingQuestion} initialText={askPrefill} />
      </section>

      {/* ── Your AI team (compact) ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Your AI team</h2>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {AI_TEAM.filter((a) => a.type !== "boss_assistant").map((a) => {
            const latest = activities.find((act) => act.assistant_type === a.type);
            const av = teamAvatars[a.type];
            return (
              <Link key={a.type} href={a.href} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-gray-200 bg-white p-3 hover:bg-gray-50">
                {av ? <AssistantAvatar id={av.id} url={av.url} size={32} /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">{(teamNames[a.type] || a.name).slice(0, 1)}</span>}
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-gray-900">
                    {teamNames[a.type] || a.name}
                    <span className={`h-1.5 w-1.5 rounded-full ${(teamStatus[a.type] ?? "active") === "active" ? "bg-emerald-500" : "bg-gray-300"}`} />
                  </p>
                  <p className="truncate text-[11px] text-gray-500">{latest ? `${latest.summary} · ${fmtAgo(latest.created_at)}` : a.role}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <PerformanceSection />

      <LeadProfileDrawer leadId={profileLeadId} onClose={() => setProfileLeadId(null)} />
      {settingsOpen && (
        <SettingsModal
          global={autopilot}
          channels={autopilotChannels}
          cells={autopilotCells}
          onGlobal={(on) => void setGlobalAutopilot(on)}
          onCell={(a, c, m) => void setCell(a, c, m)}
          onPauseAll={() => void pauseAllAutonomy()}
          overnightMode={overnightMode}
          onOvernight={(on) => void toggleOvernight(on)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

// ── header bits ────────────────────────────────────────────────────────

function BossAvatar({ avatar }: { avatar: { id: string; url: string | null } | null }) {
  if (avatar) return <AssistantAvatar id={avatar.id} url={avatar.url} size={40} />;
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-lg text-white" aria-hidden>
      ♛
    </span>
  );
}

function AutopilotToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      title={on ? "Autopilot on — the Boss acts, then tells you" : "Autopilot off — the Boss asks before sending"}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        on ? "bg-emerald-100 text-emerald-800" : "border border-gray-200 bg-white text-gray-600"
      }`}
    >
      <span aria-hidden>{on ? "🛫" : "✈️"}</span>
      {on ? "Autopilot on" : "Autopilot off"}
    </button>
  );
}

// ── context strip ────────────────────────────────────────────────────

function ContextStrip({
  metrics, eventsCount, dealsCount, deadlinesCount, hotLeads, events, deals, alerts, onOpenLead,
}: {
  metrics: SummaryMetrics | null;
  eventsCount: number | undefined;
  dealsCount: number | undefined;
  deadlinesCount: number | undefined;
  hotLeads: HotLead[];
  events: EventItem[];
  deals: TransactionItem[];
  alerts: DeadlineAlert[];
  onOpenLead: (id: string) => void;
}) {
  const [open, setOpen] = useState<null | "hot" | "today" | "deals" | "dead">(null);
  const toggle = (k: "hot" | "today" | "deals" | "dead") => setOpen((cur) => (cur === k ? null : k));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Hot leads" value={metrics?.hotLeads} tone="hot" active={open === "hot"} onClick={() => toggle("hot")} />
        <Metric label="Appts today" value={eventsCount} active={open === "today"} onClick={() => toggle("today")} />
        <Metric label="Active deals" value={dealsCount} active={open === "deals"} onClick={() => toggle("deals")} />
        <Metric label="Deadlines" value={deadlinesCount} tone={deadlinesCount ? "warn" : undefined} active={open === "dead"} onClick={() => toggle("dead")} />
      </div>
      {open && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white p-2">
          {open === "hot" && (hotLeads.length ? hotLeads.map((l) => (
            <button key={l.id} type="button" onClick={() => onOpenLead(l.id)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900">{l.name ?? "Unnamed lead"}</span>
                <span className="block truncate text-xs text-gray-500">{[l.ai_intent, l.source, l.last_activity_at ? `active ${fmtAgo(l.last_activity_at)}` : null].filter(Boolean).join(" · ") || "No activity yet"}</span>
              </span>
              {typeof l.engagement_score === "number" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{l.engagement_score}</span>}
            </button>
          )) : <Empty>No hot leads right now.</Empty>)}
          {open === "today" && (events.length ? events.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-gray-900">{e.title}</span>{e.lead_name && <span className="block truncate text-xs text-gray-500">{e.lead_name}</span>}</span>
              <span className="text-xs font-medium text-blue-600">{fmtTime(e.starts_at)}</span>
            </div>
          )) : <Empty>No appointments today.</Empty>)}
          {open === "deals" && (deals.length ? deals.map((d) => (
            <Link key={d.id} href={`/dashboard/transactions/${d.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <span className="truncate text-sm font-medium text-gray-900">{d.property_address}</span>
              <span className="shrink-0 text-xs text-gray-500">{d.status}</span>
            </Link>
          )) : <Empty>No active deals.</Empty>)}
          {open === "dead" && (alerts.length ? alerts.map((a) => (
            <Link key={`${a.transactionId}-${a.label}`} href={`/dashboard/transactions/${a.transactionId}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-gray-900">{a.propertyAddress}</span><span className="block text-xs text-gray-500">{a.label}</span></span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.risk === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{fmtDay(a.due)}</span>
            </Link>
          )) : <Empty>No deadlines in the next 7 days.</Empty>)}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone, active, onClick }: { label: string; value: number | undefined; tone?: "hot" | "warn"; active: boolean; onClick: () => void }) {
  const color = tone === "hot" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-gray-900";
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border bg-white p-3 text-left transition ${active ? "border-blue-300 ring-1 ring-blue-200" : "border-gray-200 hover:border-gray-300"}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold ${color}`}>{value ?? "—"}</p>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-3 text-center text-xs text-gray-400">{children}</p>;
}

// ── conversation bits ──────────────────────────────────────────────────

function BossBubble({ bossName, avatar, children }: { bossName: string; avatar: { id: string; url: string | null } | null; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="shrink-0">{avatar ? <AssistantAvatar id={avatar.id} url={avatar.url} size={30} alt={bossName} /> : <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-blue-600 text-sm text-white" aria-hidden title={bossName}>♛</span>}</span>
      <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-gray-200 bg-white p-3">{children}</div>
    </div>
  );
}

function ProposalCard({
  rec, bossName, avatar, onHandle, onOpenLead, onDismiss,
}: {
  rec: Recommendation;
  bossName: string;
  avatar: { id: string; url: string | null } | null;
  onHandle: () => void;
  onOpenLead: (() => void) | null;
  onDismiss: () => void;
}) {
  const [handled, setHandled] = useState(false);
  return (
    <BossBubble bossName={bossName} avatar={avatar}>
      <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Proposal</span>
      <p className="text-sm font-medium text-gray-900">{rec.title}</p>
      {(rec.summary || rec.reason) && <p className="mt-0.5 text-xs text-gray-500">{[rec.summary, rec.reason].filter(Boolean).join(" — ")}</p>}
      {rec.expected_outcome && <p className="mt-0.5 text-xs font-medium text-[#8a6a0e]">→ {rec.expected_outcome}</p>}
      {handled ? (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700"><span aria-hidden>✓</span> Handed to your team — see below.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {/* Most proposals point at a page to review/act on (a transaction,
              invoices, tasks). Honor that: open the lead drawer for contact
              proposals, navigate to action_href otherwise, and only fall back
              to routing it through the Boss when there's no destination. */}
          {onOpenLead ? (
            <button type="button" onClick={onOpenLead} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
              {rec.recommended_action && rec.recommended_action.length > 3 ? rec.recommended_action : "Open lead"}
            </button>
          ) : rec.action_href ? (
            <Link href={rec.action_href} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
              {rec.recommended_action && rec.recommended_action.length > 3 ? rec.recommended_action : "Open"}
            </Link>
          ) : (
            <button type="button" onClick={() => { setHandled(true); onHandle(); }} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
              Have Boss handle it
            </button>
          )}
          <button type="button" onClick={onDismiss} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-50">Not now</button>
        </div>
      )}
    </BossBubble>
  );
}

function InstructionExchange({
  instruction, tasks, run, bossName, avatar, teamNames, onChanged,
}: {
  instruction: InstructionRow;
  tasks: TaskRow[];
  run: RunRow | null;
  bossName: string;
  avatar: { id: string; url: string | null } | null;
  teamNames: Record<string, string>;
  onChanged: () => void | Promise<void>;
}) {
  const processing = instruction.status === "pending" || instruction.status === "processing";
  return (
    <div className="space-y-2">
      {/* the command you gave */}
      <div className="flex justify-end">
        <p className="max-w-[80%] rounded-xl rounded-tr-sm bg-blue-600 px-3 py-2 text-sm text-white">{instruction.content}</p>
      </div>
      {run ? (
        /* Boss v2: the live run replaces parse-and-route — plan, step
           timeline, approvals, and the final report all in one card. */
        <BossBubble bossName={bossName} avatar={avatar}>
          <RunCard runId={run.id} onChanged={onChanged} />
        </BossBubble>
      ) : processing ? (
        <BossBubble bossName={bossName} avatar={avatar}>
          <p className="text-sm text-gray-500">On it — breaking this into actions…</p>
        </BossBubble>
      ) : instruction.status === "failed" ? (
        <BossBubble bossName={bossName} avatar={avatar}>
          <p className="text-sm text-gray-500">Couldn&apos;t work that one out — try rephrasing it.</p>
        </BossBubble>
      ) : tasks.length > 0 ? (
        <BossBubble bossName={bossName} avatar={avatar}>
          <div className="space-y-2">
            {tasks.map((t) => <TaskBubble key={t.id} task={t} teamNames={teamNames} onChanged={onChanged} />)}
          </div>
        </BossBubble>
      ) : instruction.clarification ? (
        // Vague/non-actionable ask → one clarifying question, no no-op task card.
        <BossBubble bossName={bossName} avatar={avatar}>
          <p className="text-sm text-gray-700">{instruction.clarification}</p>
          <p className="mt-1 text-xs text-gray-400">Send a more specific instruction and I&apos;ll take it from there.</p>
        </BossBubble>
      ) : null}
    </div>
  );
}

function TaskBubble({ task: t, teamNames, onChanged }: { task: TaskRow; teamNames: Record<string, string>; onChanged: () => void | Promise<void> }) {
  const [busy, setBusy] = useState<"approve" | "dismiss" | "answer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  async function act(action: "approve" | "dismiss" | "answer") {
    if (action === "answer" && !answer.trim()) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/realtyboss/instruction-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "answer" ? { id: t.id, action, answer: answer.trim() } : { id: t.id, action }),
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

  const who = teamNames[t.assigned_to] ?? ASSIGNEE_LABEL[t.assigned_to] ?? t.assigned_to;
  const done = t.status === "sent" || t.status === "completed" || t.status === "done";

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm text-gray-800">
          {done && <span className="mr-1 text-emerald-600">✓</span>}
          {t.status === "dismissed" && <span className="mr-1 text-gray-400">✕</span>}
          {t.title}
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${done ? "bg-emerald-50 text-emerald-700" : t.status === "needs_input" || t.assigned_to === "realtor" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-700"}`}>
          {done ? "Done" : t.status === "scheduled" ? "Scheduled" : t.status === "needs_input" ? "Needs info" : t.status === "awaiting_approval" ? "Awaiting you" : who}
        </span>
      </div>

      {t.status === "awaiting_approval" && t.draft_body && (
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a6a0e]">
            Draft {t.draft_channel === "sms" ? "text" : "email"}{t.execution_note && !t.execution_note.startsWith("to:") ? ` · ${t.execution_note}` : ""}
          </p>
          {t.draft_subject && <p className="mt-1 text-xs font-medium text-gray-800">{t.draft_subject}</p>}
          <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{t.draft_body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy !== null} onClick={() => act("approve")} className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy === "approve" ? "Sending…" : "Approve & send"}</button>
            <button type="button" disabled={busy !== null} onClick={() => act("dismiss")} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Dismiss</button>
            {error && <span className="text-[11px] text-red-600">{error}</span>}
          </div>
        </div>
      )}

      {t.status === "needs_input" && (
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
          <p className="text-xs text-amber-900">{t.follow_up_question ?? "I need one more detail to start this."}</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void act("answer"); } }}
              placeholder="Type your answer…"
              className="min-w-0 flex-1 rounded-lg border border-amber-200 px-2.5 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <button type="button" disabled={busy !== null || !answer.trim()} onClick={() => act("answer")} className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy === "answer" ? "Working…" : "Send"}</button>
          </div>
          {error && <span className="mt-1 block text-[11px] text-red-600">{error}</span>}
        </div>
      )}

      {t.status === "scheduled" && t.execution_note && (
        <p className="mt-1 text-[11px] text-amber-700">{t.execution_note}</p>
      )}

      {t.status === "completed" && (t.execution_note || t.artifact_url) && (
        <div className="mt-1">
          {t.execution_note && <p className="text-[11px] text-gray-500">{t.execution_note}</p>}
          {t.artifact_url && (
            <a href={t.artifact_url} className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline">
              View {t.artifact_type === "cma" ? "CMA" : t.artifact_type === "presentation" ? "presentation" : "result"} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function CommandBar({ onSubmit, autopilot, pendingQuestion, initialText }: { onSubmit: (text: string) => void; autopilot: boolean; pendingQuestion?: string | null; initialText?: string }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  // Prefill from a deep link (e.g. /dashboard/boss?ask=… launched from the
  // welcome page's "Ask Max" prompts). We seed the box + focus, but never
  // auto-send — the agent stays in control of what actually runs.
  useEffect(() => {
    if (initialText && initialText.trim()) {
      setText(initialText);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el) {
          el.focus();
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
        }
      });
    }
  }, [initialText]);
  const send = () => { if (text.trim()) { onSubmit(text); setText(""); if (ref.current) ref.current.style.height = "auto"; } };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2">
      {pendingQuestion ? (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[11px] text-amber-900">
          Answering: <span className="font-medium">{pendingQuestion}</span>
        </div>
      ) : (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_COMMANDS.map((q) => (
            <button key={q} type="button" onClick={() => onSubmit(q)} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-100">{q}</button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder={pendingQuestion ? "Type your answer…" : autopilot ? "Tell your team what to do — they'll act and report back…" : "Tell your team what to do…"}
          className="max-h-[120px] min-h-[38px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button type="button" onClick={send} disabled={!text.trim()} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" aria-label="Send">↑</button>
      </div>
    </div>
  );
}

// ── settings modal (per-assistant · per-channel autopilot) ─────────────

function SettingsModal({
  global, channels, cells, onGlobal, onCell, onPauseAll, overnightMode, onOvernight, onClose,
}: {
  global: boolean;
  channels: AutopilotChannels[];
  cells: AutopilotCell[];
  onGlobal: (on: boolean) => void;
  onCell: (assignee: string, channel: Channel, mode: "ask" | "auto") => void;
  onPauseAll: () => void;
  overnightMode: boolean;
  onOvernight: (on: boolean) => void;
  onClose: () => void;
}) {
  const cellMode = (assignee: string, channel: Channel): "ask" | "auto" => {
    const c = cells.find((x) => x.assignee === assignee && x.channel === channel);
    if (c) return c.mode;
    return global ? "auto" : "ask";
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Approval settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <p className="mt-1 text-xs text-gray-500">Choose where the Boss acts on its own and where it asks first — per assistant, per channel.</p>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 p-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Autopilot (all channels)</p>
            <p className="text-xs text-gray-500">The master switch. Per-channel choices below override it.</p>
          </div>
          <AutopilotToggle on={global} onToggle={() => onGlobal(!global)} />
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-200 p-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Overnight mode 🌙</p>
            <p className="text-xs text-gray-500">
              The Boss works your pipeline at ~4am: research + tasks done, outbound drafted for your
              morning approval. Never calls, never sends overnight.
            </p>
          </div>
          <AutopilotToggle on={overnightMode} onToggle={() => onOvernight(!overnightMode)} />
        </div>

        <div className="mt-3 space-y-2">
          {channels.map((row) => (
            <div key={row.assignee} className="rounded-xl border border-gray-200 p-3">
              <p className="mb-2 text-sm font-medium text-gray-900">{ASSIGNEE_LABEL[row.assignee] ?? row.assignee}</p>
              <div className="flex flex-wrap gap-1.5">
                {row.channels.map((ch) => {
                  const mode = cellMode(row.assignee, ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => onCell(row.assignee, ch, mode === "auto" ? "ask" : "auto")}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${mode === "auto" ? "bg-emerald-100 text-emerald-800" : "border border-gray-200 bg-white text-gray-500"}`}
                    >
                      {CHANNEL_LABEL[ch]}: {mode === "auto" ? "auto" : "ask"}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onPauseAll}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
            title="Flip everything to ask-first — nothing sends without you"
          >
            ⏸ Pause all autonomy
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Done</button>
        </div>
      </div>
    </div>
  );
}

// ── performance (collapsible, lazy) ────────────────────────────────────

const RevenuePanel = nextDynamic(() => import("@/components/dashboard/RevenuePanel").then((m) => m.RevenuePanel), { ssr: false, loading: () => <p className="py-4 text-sm text-gray-400">Loading…</p> });
const PipelineForecastPanel = nextDynamic(() => import("@/components/dashboard/PipelineForecastPanel").then((m) => m.PipelineForecastPanel), { ssr: false, loading: () => <p className="py-4 text-sm text-gray-400">Loading…</p> });
const EmailEngagementPanel = nextDynamic(() => import("@/components/dashboard/EmailEngagementPanel").then((m) => m.EmailEngagementPanel), { ssr: false, loading: () => <p className="py-4 text-sm text-gray-400">Loading…</p> });

function PerformanceSection() {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50" aria-expanded={open}>
        📈 Business performance <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-5">
          <div><h3 className="mb-2 text-sm font-semibold text-gray-900">Revenue &amp; commission</h3><RevenuePanel /></div>
          <div><h3 className="mb-1 text-sm font-semibold text-gray-900">Pipeline forecast</h3><PipelineForecastPanel /></div>
          <div><h3 className="mb-1 text-sm font-semibold text-gray-900">Email engagement</h3><EmailEngagementPanel /></div>
        </div>
      )}
    </section>
  );
}
