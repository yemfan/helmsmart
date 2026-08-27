"use client";


import BriefingScheduleCard from "@/components/dashboard/BriefingScheduleCard";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import nextDynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AI_TEAM } from "@/lib/closeboss/team";
import { LeadProfileDrawer } from "@/components/closeboss/LeadProfileDrawer";
import { AssistantAvatar } from "@/components/closeboss/AssistantAvatar";
import RunCard from "@/components/closeboss/RunCard";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";
import { LoadingText } from "@/components/ui/LoadingText";

/** A file the user attached in the command bar (uploaded to Storage). */
type CommandAttachment = { path: string; name: string; mime: string; kind: "ad_photo" | "contact_import" };

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
type AutopilotCell = { assignee: string; channel: Channel; mode: "ask" | "assisted" | "auto" };
type AutopilotChannels = { assignee: string; channels: Channel[] };

/** Boss v2 live run (see /api/dashboard/closeboss/runs). */
type RunRow = {
  id: string;
  instruction_id: string | null;
  trigger: "command" | "overnight" | "retry";
  status: "planning" | "running" | "awaiting_approval" | "completed" | "failed" | "budget_exceeded" | "cancelled";
  objective: string;
  started_at: string;
};
const LIVE_RUN_STATUSES = new Set(["planning", "running", "awaiting_approval"]);

/** A teammate's live state for the top status ribbon. */
type TeamState = "working" | "needs-you" | "active" | "idle" | "off";
type TeamLive = { type: string; state: TeamState; verb: string };

/**
 * Assistant + channel labels and the starter commands are authored in English
 * and resolved through `dashboard:boss.*` at render time. "Max" is a name, so
 * it is not a translation key.
 */
const CHANNEL_KEYS: Channel[] = ["call", "sms", "email", "social"];
const QUICK_COMMAND_KEYS = ["checkIn", "justListed", "planDay"] as const;

// Live status verbs for the team ribbon — present tense when busy, a calm
// standby phrase when idle. Keeps the "company floor" feeling: someone is
// always on.
/** Assistants that have their own status verbs; others use the generic pair. */
const TEAM_VERB_KEYS = new Set([
  "receptionist",
  "sales_assistant",
  "marketing_assistant",
  "transaction_assistant",
  "accountant",
]);

// ── helpers ──────────────────────────────────────────────────────────

function fmtAgo(iso: string, locale: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
function fmtDay(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
function fmtTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

// How many recent exchanges the thread shows before you page back in time.
// Kept small so the command center stays scannable; "Load earlier" walks the
// history by date from here.
const RECENT_LIMIT = 6;

/** "Today" / "Yesterday" / weekday / "Aug 3" — the day-separator label. */
function dayLabel(iso: string, tr: (k: string, o?: Record<string, unknown>) => string, locale: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays <= 0) return tr("boss.day.today");
  if (diffDays === 1) return tr("boss.day.yesterday");
  if (diffDays < 7) return d.toLocaleDateString(locale, { weekday: "long" });
  return d.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

type DeadlineAlert = { transactionId: string; propertyAddress: string; label: string; due: Date; risk: "high" | "medium" };
function deadlineAlerts(transactions: TransactionItem[], tr: (k: string, o?: Record<string, unknown>) => string): DeadlineAlert[] {
  const now = Date.now();
  const horizon = now + 7 * 24 * 60 * 60 * 1000;
  const alerts: DeadlineAlert[] = [];
  for (const t of transactions) {
    if (t.status !== "active" && t.status !== "pending") continue;
    const candidates = [
      { label: tr("boss.deadlines.inspection"), date: t.inspection_deadline, done: t.inspection_completed_at },
      { label: tr("boss.deadlines.appraisal"), date: t.appraisal_deadline, done: t.appraisal_completed_at },
      { label: tr("boss.deadlines.loan"), date: t.loan_contingency_deadline, done: t.loan_contingency_removed_at },
      { label: tr("boss.deadlines.closing"), date: t.closing_date, done: null as string | null },
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
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [hotLeads, setHotLeads] = useState<HotLead[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [briefing, setBriefing] = useState<BriefingRow | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [instructions, setInstructions] = useState<InstructionRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  // Older pages walked back via "Load earlier" (kept separate from the polled
  // recent window so a poll never clobbers history the user paged in).
  const [earlier, setEarlier] = useState<InstructionRow[]>([]);
  const [earlierTasks, setEarlierTasks] = useState<TaskRow[]>([]);
  const [hasMoreEarlier, setHasMoreEarlier] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const earlierCountRef = useRef(0);
  useEffect(() => { earlierCountRef.current = earlier.length; }, [earlier]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [teamStatus, setTeamStatus] = useState<Record<string, "active" | "paused">>({});
  const [teamAvatars, setTeamAvatars] = useState<Record<string, { id: string; url: string | null }>>({});

  const [autopilot, setAutopilot] = useState(false);
  const [autopilotCells, setAutopilotCells] = useState<AutopilotCell[]>([]);
  const [autopilotChannels, setAutopilotChannels] = useState<AutopilotChannels[]>([]);
  const [overnightMode, setOvernightMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [profileLeadId, setProfileLeadId] = useState<string | null>(null);
  const [pendingDrafts, setPendingDrafts] = useState(0);
  const [loading, setLoading] = useState(true);

  // Stay pinned to the newest message, the way a chat does.
  //
  // A single scroll on load was not enough. This page fills in over several
  // seconds — recommendations, runs, tasks and the performance block all land
  // after first paint, and each one grows the page underneath a scroll that has
  // already happened, leaving you stranded short of the end. So we follow the
  // content down until you scroll away, and give you a way back when you do.
  const [atBottom, setAtBottom] = useState(true);
  const stickRef = useRef(true);
  const landedRef = useRef(false);

  const scrollToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    const pane = document.getElementById("agent-portal-main");
    if (!pane) return;
    stickRef.current = true;
    setAtBottom(true);
    pane.scrollTo({ top: pane.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const pane = document.getElementById("agent-portal-main");
    if (!pane) return;
    // Generous: "near enough the bottom" is what a reader means by being at the
    // bottom, and a few pixels of drift should not unpin them or flash a button.
    const NEAR_BOTTOM_PX = 120;
    const check = () => {
      const near = pane.scrollHeight - pane.scrollTop - pane.clientHeight <= NEAR_BOTTOM_PX;
      stickRef.current = near;
      setAtBottom(near);
    };
    pane.addEventListener("scroll", check, { passive: true });

    // Follow late-arriving content down — but only while the reader has not
    // deliberately gone somewhere else. Yanking someone back mid-read is worse
    // than leaving them short of the end.
    const content = pane.firstElementChild;
    const ro =
      content && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (stickRef.current) pane.scrollTo({ top: pane.scrollHeight });
          })
        : null;
    ro?.observe(content as Element);

    check();
    return () => {
      pane.removeEventListener("scroll", check);
      ro?.disconnect();
    };
  }, []);

  // The first landing jumps rather than glides: animating through a page you
  // have not seen yet is disorienting, and slow.
  useEffect(() => {
    if (loading || landedRef.current) return;
    landedRef.current = true;
    const id = requestAnimationFrame(() => scrollToEnd("auto"));
    return () => cancelAnimationFrame(id);
  }, [loading, scrollToEnd]);

  const loadConversation = useCallback(async () => {
    const [res, runsRes] = await Promise.all([
      fetch(`/api/dashboard/closeboss/instructions?limit=${RECENT_LIMIT}`).then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/closeboss/runs?limit=12").then((r) => r.json()).catch(() => ({})),
    ]);
    const recent = (res?.instructions ?? []) as InstructionRow[];
    setInstructions(recent.slice().reverse());
    setTasks((res?.tasks ?? []) as TaskRow[]);
    setRuns((runsRes?.runs ?? []) as RunRow[]);
    // Seed the pager only when we haven't paged back yet — otherwise a poll
    // would resurrect the "Load earlier" button after the user reached the end.
    if (earlierCountRef.current === 0) {
      setHasMoreEarlier(Boolean(res?.hasMore) || recent.length >= RECENT_LIMIT);
    }
  }, []);

  // Page back through history by date. Cursor = the oldest exchange already
  // shown; the API returns the next older page (see the route's `before`).
  const loadEarlier = useCallback(async () => {
    setLoadingEarlier(true);
    try {
      const shown = [...earlier, ...instructions];
      const oldest = shown.reduce<string | null>(
        (min, i) => (!min || new Date(i.created_at) < new Date(min) ? i.created_at : min),
        null,
      );
      if (!oldest) { setHasMoreEarlier(false); return; }
      const res = await fetch(
        `/api/dashboard/closeboss/instructions?limit=${RECENT_LIMIT}&before=${encodeURIComponent(oldest)}`,
      ).then((r) => r.json()).catch(() => ({}));
      const older = (res?.instructions ?? []) as InstructionRow[];
      setEarlier((prev) => {
        const map = new Map(prev.map((i) => [i.id, i]));
        for (const i of older) map.set(i.id, i);
        return [...map.values()];
      });
      setEarlierTasks((prev) => {
        const map = new Map(prev.map((t) => [t.id, t]));
        for (const t of (res?.tasks ?? []) as TaskRow[]) map.set(t.id, t);
        return [...map.values()];
      });
      setHasMoreEarlier(Boolean(res?.hasMore));
    } finally {
      setLoadingEarlier(false);
    }
  }, [earlier, instructions]);

  const loadData = useCallback(async () => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

    const [summaryRes, eventsRes, hotRes, txRes, recsRes, actsRes, teamRes, briefRes, apRes, draftsRes] = await Promise.all([
      fetch("/api/dashboard/summary").then((r) => r.json()).catch(() => ({})),
      fetch(`/api/dashboard/calendar/events?from=${todayStart}&to=${todayEnd}`).then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/leads?filter=hot&pageSize=5").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/transactions").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/closeboss/recommendations").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/closeboss/activities?limit=40").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/closeboss/team").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/briefings?limit=1").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/closeboss/autopilot").then((r) => r.json()).catch(() => ({})),
      // Drafts Chris and the others have written but nobody has approved. They
      // sit on their own page, which is fine until you stop visiting it — so
      // Max says the number out loud.
      fetch("/api/dashboard/drafts?status=pending").then((r) => r.json()).catch(() => ({})),
    ]);

    const m = summaryRes?.metrics;
    if (m) setMetrics({ totalLeads: m.totalLeads ?? 0, hotLeads: m.hotLeads ?? 0, inactive7Days: m.inactive7Days ?? 0, messagesSent: m.messagesSent ?? 0 });
    setEvents(((eventsRes?.events ?? []) as EventItem[]).slice(0, 8));
    setHotLeads(((hotRes?.leads ?? []) as HotLead[]).slice(0, 8));
    setTransactions((txRes?.transactions ?? []) as TransactionItem[]);
    setRecommendations((recsRes?.recommendations ?? []) as Recommendation[]);
    setActivities((actsRes?.activities ?? []) as ActivityRow[]);
    setPendingDrafts(((draftsRes?.drafts ?? []) as unknown[]).length);
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

  const submitCommand = useCallback(async (text: string, attachment?: CommandAttachment) => {
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
      await fetch("/api/dashboard/closeboss/instruction-tasks", {
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
    await fetch("/api/dashboard/closeboss/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attachment ? { content, attachment } : { content }),
    }).catch(() => {});
    await loadConversation();
  }, [loadConversation, tasks]);

  const resolveRecommendation = useCallback(async (id: string, status: "completed" | "dismissed") => {
    setRecommendations((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/dashboard/closeboss/recommendations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }, []);

  const setGlobalAutopilot = useCallback(async (on: boolean) => {
    setAutopilot(on);
    await fetch("/api/dashboard/closeboss/autopilot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ global: on }),
    }).catch(() => setAutopilot(!on));
  }, []);

  const setCell = useCallback(async (assignee: string, channel: Channel, mode: "ask" | "assisted" | "auto") => {
    setAutopilotCells((prev) => {
      const next = prev.filter((c) => !(c.assignee === assignee && c.channel === channel));
      return [...next, { assignee, channel, mode }];
    });
    await fetch("/api/dashboard/closeboss/autopilot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignee, channel, mode }),
    }).catch(() => {});
  }, []);

  const toggleOvernight = useCallback(async (on: boolean) => {
    setOvernightMode(on);
    await fetch("/api/dashboard/closeboss/autopilot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overnightMode: on }),
    }).catch(() => setOvernightMode(!on));
  }, []);

  // One tap: global off + every per-channel cell to "ask" (HANDOFF PR-4).
  const pauseAllAutonomy = useCallback(async () => {
    setAutopilot(false);
    setAutopilotCells((prev) => prev.map((c) => ({ ...c, mode: "ask" as const })));
    await fetch("/api/dashboard/closeboss/autopilot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pauseAll: true }),
    }).catch(() => {});
  }, []);

  // Time-of-day greeting depends on the viewer's local clock — compute it on
  // the client only to avoid a hydration mismatch (#418) when the server clock
  // produces a different bucket than the browser. Seed with a clock-independent
  // default so SSR and the first client render agree.
  const [greeting, setGreeting] = useState(() => tr("boss.greeting.welcome"));
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? tr("boss.greeting.morning") : h < 17 ? tr("boss.greeting.afternoon") : tr("boss.greeting.evening"));
    // Re-runs on language change too: the greeting is state, so without
    // i18n.language here it would keep whichever language it was computed in
    // when the agent flips the toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr, i18n.language]);

  // The most recent question the Boss is waiting on — the command bar answers
  // it directly (see submitCommand) and its placeholder reflects it.
  const pendingQuestion = useMemo(() => {
    const p = tasks
      .filter((t) => t.status === "needs_input")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    return p?.follow_up_question ?? null;
  }, [tasks]);

  const alerts = useMemo(() => deadlineAlerts(transactions, tr), [transactions, tr]);
  const activeDeals = useMemo(() => transactions.filter((t) => t.status === "active" || t.status === "pending"), [transactions]);

  // The full thread = paged-in history + the polled recent window, de-duped by
  // id and ordered oldest→newest so the command bar (newest) sits at the bottom.
  const allInstructions = useMemo(() => {
    const map = new Map<string, InstructionRow>();
    for (const i of [...earlier, ...instructions]) map.set(i.id, i);
    return [...map.values()].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [earlier, instructions]);
  const allTasks = useMemo(() => {
    const map = new Map<string, TaskRow>();
    for (const t of [...earlierTasks, ...tasks]) map.set(t.id, t);
    return [...map.values()];
  }, [earlierTasks, tasks]);

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

  // Live per-teammate status for the top ribbon — derived from data already
  // loaded (in-flight tasks, recent activity, paused state). No extra fetch.
  // This is what makes the roster feel like a real company floor: at a glance,
  // who's working, who needs you, who's standing by.
  const teamLive = useMemo<TeamLive[]>(() => {
    const now = Date.now();
    const recentMs = 20 * 60 * 1000;
    return AI_TEAM.filter((a) => a.type !== "boss_assistant").map((a) => {
      const type = a.type;
      if ((teamStatus[type] ?? "active") === "paused") return { type, state: "off", verb: tr("boss.verbs.off") };
      const mine = tasks.filter((t) => t.assigned_to === type);
      if (mine.some((t) => t.status === "awaiting_approval" || t.status === "needs_input" || t.status === "needs_review"))
        return { type, state: "needs-you", verb: tr("boss.verbs.needsYou") };
      const verbs = TEAM_VERB_KEYS.has(type)
        ? { working: tr(`boss.verbs.${type}.working`), idle: tr(`boss.verbs.${type}.idle`) }
        : { working: tr("boss.verbs.working"), idle: tr("boss.verbs.idle") };
      if (mine.some((t) => t.status === "assigned" || t.status === "scheduled"))
        return { type, state: "working", verb: `${verbs.working}…` };
      const latest = activities.find((act) => act.assistant_type === type);
      if (latest && now - new Date(latest.created_at).getTime() < recentMs)
        return { type, state: "active", verb: tr("boss.verbs.activeNow") };
      return { type, state: "idle", verb: verbs.idle };
    });
  }, [tasks, activities, teamStatus]);

  const bossName = teamNames["boss_assistant"] || "Max";
  const bossAvatar = teamAvatars["boss_assistant"] ?? null;

  return (
    <div className="space-y-4">
      {/* ── Header: Boss identity · autopilot · settings ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BossAvatar avatar={bossAvatar} />
          <div>
            <h1 className="text-lg font-semibold leading-tight text-gray-900">👋 {bossName}</h1>
            <p className="text-xs text-gray-500">{tr("boss.captain")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AutopilotToggle on={autopilot} onToggle={() => void setGlobalAutopilot(!autopilot)} />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            aria-label={tr("boss.approvals.title")}
            title={tr("boss.approvals.title")}
          >
            ⚙
          </button>
        </div>
      </div>

      {/* ── AI team status ribbon — who's working right now ── */}
      {!loading && <TeamStatusStrip team={teamLive} names={teamNames} avatars={teamAvatars} />}

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
            {briefing?.headline?.trim() || briefing?.summary?.split(/[.!?]\s/)[0] || tr("boss.defaultHeadline")}
          </p>
          {briefing?.insights?.topOpportunity && (
            <p className="mt-1.5 text-xs font-medium text-[#8a6a0e]">→ {briefing.insights.topOpportunity}</p>
          )}
          {teamDigest && (
            <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-600">
              <span className="font-semibold text-gray-800">{tr("pages.boss.teamFinished", { count: teamDigest.total })}</span> — {teamDigest.line}.
              {teamDigest.needsYou > 0 && (
                <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                  {tr("pages.boss.needsYou", { count: teamDigest.needsYou })}
                </span>
              )}
            </p>
          )}
          {pendingDrafts > 0 && (
            <p className="mt-2">
              <Link
                href="/dashboard/drafts"
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
              >
                ✍️ {tr("pages.boss.draftsAwaiting", { count: pendingDrafts })}
                <span aria-hidden>→</span>
              </Link>
            </p>
          )}
        </BossBubble>

        {/* When the briefing arrives, set where the briefing arrives.

            This lived in Settings → Voice & Style, which is a strange place to
            look for it: nothing about the briefing is a voice or a style, and
            the thing it schedules shows up here. Collapsed by default so the
            page still opens on the day's work rather than on a form. */}
        <div className="px-1">
          <button
            type="button"
            onClick={() => setScheduleOpen((v) => !v)}
            className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            aria-expanded={scheduleOpen}
          >
            {tr("pages.boss.briefingScheduleToggle")}
          </button>
          {scheduleOpen && (
            <div className="mt-2">
              <BriefingScheduleCard />
            </div>
          )}
        </div>

        {/* Today's priorities — the proposals the recommendations engine surfaced */}
        {recommendations.length > 0 && (
          <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr("pages.boss.todaysPriorities")}</p>
        )}
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
                {r.trigger === "overnight" ? tr("boss.runs.overnight") : tr("boss.runs.earlier")}: {r.objective.slice(0, 120)}
              </p>
              <RunCard runId={r.id} onChanged={loadConversation} />
            </BossBubble>
          ))}

        {/* Page back through older conversations by date */}
        {hasMoreEarlier && allInstructions.length > 0 && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => void loadEarlier()}
              disabled={loadingEarlier}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingEarlier ? <LoadingText /> : "↑ Load earlier conversations"}
            </button>
          </div>
        )}

        {/* Live conversation — instructions you sent + the team's replies,
            grouped by day so the thread reads as a dated history. */}
        {allInstructions.map((ins, idx) => {
          const prev = allInstructions[idx - 1];
          const showSeparator = !prev || dayLabel(prev.created_at, tr, locale) !== dayLabel(ins.created_at, tr, locale);
          return (
            <Fragment key={ins.id}>
              {showSeparator && (
                <div className="flex items-center gap-2 py-1" aria-hidden>
                  <span className="h-px flex-1 bg-gray-200" />
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {dayLabel(ins.created_at, tr, locale)}
                  </span>
                  <span className="h-px flex-1 bg-gray-200" />
                </div>
              )}
              <InstructionExchange
                instruction={ins}
                tasks={allTasks.filter((t) => t.instruction_id === ins.id)}
                run={runs.find((r) => r.instruction_id === ins.id) ?? null}
                bossName={bossName}
                avatar={bossAvatar}
                teamNames={teamNames}
                onChanged={loadConversation}
              />
            </Fragment>
          );
        })}

        {recommendations.length === 0 && allInstructions.length === 0 && !loading && (
          <BossBubble bossName={bossName} avatar={bossAvatar}>
            <p className="text-sm text-gray-600">{tr("pages.boss.nothingUrgent")}</p>
          </BossBubble>
        )}

      </section>

      <PerformanceSection />

      {/* The composer sits last and sticks to the bottom of the scroll pane, so
          it is always reachable without scrolling to find it. Negative margins
          cancel <main>'s padding so the bar spans the full width; the blur keeps
          the conversation legible as it passes underneath. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-gray-200 bg-slate-50/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8 lg:-mx-10 lg:px-10">
        {!atBottom && (
          <button
            type="button"
            onClick={() => scrollToEnd()}
            aria-label={tr("pages.boss.scrollToEnd")}
            title={tr("pages.boss.scrollToEnd")}
            className="absolute -top-5 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-gray-300 bg-white text-base text-gray-700 shadow-md transition hover:bg-gray-50"
          >
            <span aria-hidden>↓</span>
          </button>
        )}
        <CommandBar onSubmit={submitCommand} autopilot={autopilot} pendingQuestion={pendingQuestion} initialText={askPrefill} />
      </div>

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
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      title={on ? tr("boss.autopilot.onTitle") : tr("boss.autopilot.offTitle")}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        on ? "bg-emerald-100 text-emerald-800" : "border border-gray-200 bg-white text-gray-600"
      }`}
    >
      <span aria-hidden>{on ? "🛫" : "✈️"}</span>
      {on ? tr("boss.autopilot.on") : tr("boss.autopilot.off")}
    </button>
  );
}

// ── team status ribbon ─────────────────────────────────────────────────

const TEAM_DOT: Record<TeamState, string> = {
  working: "bg-blue-500",
  "needs-you": "bg-amber-500",
  active: "bg-emerald-500",
  idle: "bg-emerald-400/70",
  off: "bg-gray-300",
};

/**
 * The live team ribbon: a glanceable row of the AI employees and what each is
 * doing this moment. Working/needs-you dots pulse so the floor feels alive.
 * This is now the ONLY roster on the page: the duplicate grid that used to sit
 * at the bottom said the same six names a second time, far below where anyone
 * looks. Reads from state already loaded, so it re-derives on every poll.
 */
function TeamStatusStrip({
  team, names, avatars,
}: {
  team: TeamLive[];
  names: Record<string, string>;
  avatars: Record<string, { id: string; url: string | null }>;
}) {
  if (team.length === 0) return null;
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
      {team.map((m) => {
        const av = avatars[m.type];
        const name = names[m.type] ?? m.type;
        const pulse = m.state === "working" || m.state === "needs-you";
        return (
          <div
            key={m.type}
            className="flex shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 shadow-sm"
            title={`${name} · ${m.verb}`}
          >
            {av ? (
              <AssistantAvatar id={av.id} url={av.url} size={26} alt={name} />
            ) : (
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">
                {name.slice(0, 1)}
              </span>
            )}
            <span className="flex flex-col leading-tight">
              <span className="text-xs font-semibold text-gray-900">{name}</span>
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className={`h-1.5 w-1.5 rounded-full ${TEAM_DOT[m.state]} ${pulse ? "animate-pulse" : ""}`} />
                {m.verb}
              </span>
            </span>
          </div>
        );
      })}
    </div>
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
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [open, setOpen] = useState<null | "hot" | "today" | "deals" | "dead">(null);
  const toggle = (k: "hot" | "today" | "deals" | "dead") => setOpen((cur) => (cur === k ? null : k));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label={tr("boss.metrics.hotLeads")} value={metrics?.hotLeads} tone="hot" active={open === "hot"} onClick={() => toggle("hot")} />
        <Metric label={tr("boss.metrics.apptsToday")} value={eventsCount} active={open === "today"} onClick={() => toggle("today")} />
        <Metric label={tr("boss.metrics.activeDeals")} value={dealsCount} active={open === "deals"} onClick={() => toggle("deals")} />
        <Metric label={tr("boss.metrics.deadlines")} value={deadlinesCount} tone={deadlinesCount ? "warn" : undefined} active={open === "dead"} onClick={() => toggle("dead")} />
      </div>
      {open && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white p-2">
          {open === "hot" && (hotLeads.length ? hotLeads.map((l) => (
            <button key={l.id} type="button" onClick={() => onOpenLead(l.id)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900">{l.name ?? tr("pages.bossAssistant.unnamedLead")}</span>
                <span className="block truncate text-xs text-gray-500">{[l.ai_intent, l.source, l.last_activity_at ? `active ${fmtAgo(l.last_activity_at, locale)}` : null].filter(Boolean).join(" · ") || tr("pages.bossAssistant.noActivityYet")}</span>
              </span>
              {typeof l.engagement_score === "number" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{l.engagement_score}</span>}
            </button>
          )) : <Empty>{tr("boss.metrics.noHotLeads")}</Empty>)}
          {open === "today" && (events.length ? events.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-gray-900">{e.title}</span>{e.lead_name && <span className="block truncate text-xs text-gray-500">{e.lead_name}</span>}</span>
              <span className="text-xs font-medium text-blue-600">{fmtTime(e.starts_at, locale)}</span>
            </div>
          )) : <Empty>{tr("boss.metrics.noAppts")}</Empty>)}
          {open === "deals" && (deals.length ? deals.map((d) => (
            <Link key={d.id} href={`/dashboard/transactions/${d.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <span className="truncate text-sm font-medium text-gray-900">{d.property_address}</span>
              <span className="shrink-0 text-xs text-gray-500">{d.status}</span>
            </Link>
          )) : <Empty>{tr("boss.metrics.noDeals")}</Empty>)}
          {open === "dead" && (alerts.length ? alerts.map((a) => (
            <Link key={`${a.transactionId}-${a.label}`} href={`/dashboard/transactions/${a.transactionId}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-gray-900">{a.propertyAddress}</span><span className="block text-xs text-gray-500">{a.label}</span></span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.risk === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{fmtDay(a.due, locale)}</span>
            </Link>
          )) : <Empty>{tr("boss.metrics.noDeadlines")}</Empty>)}
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
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [handled, setHandled] = useState(false);
  return (
    <BossBubble bossName={bossName} avatar={avatar}>
      <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{tr("boss.proposal")}</span>
      <p className="text-sm font-medium text-gray-900">{rec.title}</p>
      {(rec.summary || rec.reason) && <p className="mt-0.5 text-xs text-gray-500">{[rec.summary, rec.reason].filter(Boolean).join(" — ")}</p>}
      {rec.expected_outcome && <p className="mt-0.5 text-xs font-medium text-[#8a6a0e]">→ {rec.expected_outcome}</p>}
      {handled ? (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700"><span aria-hidden>✓</span>{tr("pages.boss.handedToTeam")}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {/* Most proposals point at a page to review/act on (a transaction,
              invoices, tasks). Honor that: open the lead drawer for contact
              proposals, navigate to action_href otherwise, and only fall back
              to routing it through the Boss when there's no destination. */}
          {onOpenLead ? (
            <button type="button" onClick={onOpenLead} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
              {rec.recommended_action && rec.recommended_action.length > 3 ? rec.recommended_action : tr("boss.openLead")}
            </button>
          ) : rec.action_href ? (
            <Link href={rec.action_href} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
              {rec.recommended_action && rec.recommended_action.length > 3 ? rec.recommended_action : tr("boss.open")}
            </Link>
          ) : (
            <button type="button" onClick={() => { setHandled(true); onHandle(); }} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">{tr("pages.boss.haveBossHandle")}</button>
          )}
          <button type="button" onClick={onDismiss} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-50">{tr("boss.notNow")}</button>
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
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
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
          <p className="text-sm text-gray-500">{tr("pages.boss.breakingIntoActions")}</p>
        </BossBubble>
      ) : instruction.status === "failed" ? (
        <BossBubble bossName={bossName} avatar={avatar}>
          <p className="text-sm text-gray-500">{tr("boss.couldNotWorkOut")}</p>
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
          <p className="mt-1 text-xs text-gray-400">{tr("pages.boss.beMoreSpecific")}</p>
        </BossBubble>
      ) : null}
    </div>
  );
}

function TaskBubble({ task: t, teamNames, onChanged }: { task: TaskRow; teamNames: Record<string, string>; onChanged: () => void | Promise<void> }) {
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [busy, setBusy] = useState<"approve" | "dismiss" | "answer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");

  async function act(action: "approve" | "dismiss" | "answer") {
    if (action === "answer" && !answer.trim()) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/closeboss/instruction-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "answer" ? { id: t.id, action, answer: answer.trim() } : { id: t.id, action }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error || tr("boss.actionFailed"));
      setAnswer("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("boss.actionFailed"));
    } finally {
      setBusy(null);
    }
  }

  const who = teamNames[t.assigned_to] ?? tr(`boss.team.${t.assigned_to}`, { defaultValue: t.assigned_to }) as string;
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
          {done ? tr("boss.status.done") : t.status === "scheduled" ? tr("boss.status.scheduled") : t.status === "needs_input" ? tr("boss.status.needsInput") : t.status === "awaiting_approval" ? tr("boss.status.awaitingApproval") : who}
        </span>
      </div>

      {t.status === "awaiting_approval" && t.draft_body && (
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8a6a0e]">
            {tr("pages.boss.draftChannel", {
              channel: tr(t.draft_channel === "sms" ? "pages.boss.channelText" : "pages.boss.channelEmail"),
            })}
            {t.execution_note && !t.execution_note.startsWith("to:") ? ` · ${t.execution_note}` : ""}
          </p>
          {t.draft_subject && <p className="mt-1 text-xs font-medium text-gray-800">{t.draft_subject}</p>}
          <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">{t.draft_body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy !== null} onClick={() => act("approve")} className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy === "approve" ? tr("common:status.sending") : tr("pages.bossAssistant.approveSend")}</button>
            <button type="button" disabled={busy !== null} onClick={() => act("dismiss")} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">{tr("boss.dismiss")}</button>
            {error && <span className="text-[11px] text-red-600">{error}</span>}
          </div>
        </div>
      )}

      {t.status === "needs_input" && (
        <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
          <p className="text-xs text-amber-900">{t.follow_up_question ?? tr("pages.bossAssistant.iNeedOneMore")}</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void act("answer"); } }}
              placeholder={tr("pages.boss.typeAnswer")}
              className="min-w-0 flex-1 rounded-lg border border-amber-200 px-2.5 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <button type="button" disabled={busy !== null || !answer.trim()} onClick={() => act("answer")} className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy === "answer" ? tr("common:status.working") : tr("common:actions.send")}</button>
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
              {tr("pages.boss.viewArtifact", {
                kind: tr(
                  t.artifact_type === "cma"
                    ? "pages.boss.artifactCma"
                    : t.artifact_type === "presentation"
                      ? "pages.boss.artifactPresentation"
                      : "pages.boss.artifactResult",
                ),
              })}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function CommandBar({ onSubmit, autopilot, pendingQuestion, initialText }: { onSubmit: (text: string, attachment?: CommandAttachment) => void; autopilot: boolean; pendingQuestion?: string | null; initialText?: string }) {
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [text, setText] = useState("");
  const [attach, setAttach] = useState<CommandAttachment | null>(null);
  // Local object-URL for an instant image thumbnail (no round-trip to Storage).
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Release the object URL when it changes or the bar unmounts, so previews
  // don't leak.
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  const clearAttach = () => {
    setPreview((cur) => { if (cur) URL.revokeObjectURL(cur); return null; });
    setAttach(null);
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploadErr(null);
    setUploading(true);
    const isImage = f.type.startsWith("image/");
    // Show the thumbnail immediately from the local file while it uploads.
    if (isImage) setPreview((cur) => { if (cur) URL.revokeObjectURL(cur); return URL.createObjectURL(f); });
    try {
      const kind: CommandAttachment["kind"] = isImage ? "ad_photo" : "contact_import";
      const path = await uploadViaStorage(f, kind);
      setAttach({ path, name: f.name, mime: f.type, kind });
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : tr("boss.uploadFailed"));
      setPreview((cur) => { if (cur) URL.revokeObjectURL(cur); return null; });
    } finally {
      setUploading(false);
    }
  };
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
  const send = () => { if (text.trim()) { onSubmit(text, attach ?? undefined); setText(""); clearAttach(); if (ref.current) ref.current.style.height = "auto"; } };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2">
      {pendingQuestion ? (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[11px] text-amber-900">{tr("pages.boss.answering")}<span className="font-medium">{pendingQuestion}</span>
        </div>
      ) : (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {QUICK_COMMAND_KEYS.map((k) => (
            <button key={k} type="button" onClick={() => onSubmit(tr(`boss.suggestions.${k}`))} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-100">{tr(`boss.suggestions.${k}`)}</button>
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
          placeholder={pendingQuestion ? tr("boss.composer.answer") : autopilot ? tr("boss.composer.autopilot") : tr("boss.composer.ask")}
          className="max-h-[120px] min-h-[38px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          // The page exists to be typed into; landing with the cursor already
          // here saves a click every single visit.
          autoFocus
        />
        <button type="button" onClick={send} disabled={!text.trim()} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" aria-label={tr("pages.labels.send")}>↑</button>
      </div>

      {/* Add a file — attach an image to post, or a spreadsheet to import from */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <span aria-hidden className="text-sm leading-none">＋</span> {tr("boss.addFile")}
        </button>
        {uploading && <span className="text-xs text-gray-400">{tr("pages.boss.uploading")}</span>}
        {(attach || preview) && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-0.5 pl-1 pr-2 text-xs text-gray-700">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL thumbnail
              <img src={preview} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <span className="pl-1" aria-hidden>📎</span>
            )}
            <span className="max-w-[160px] truncate">{attach?.name ?? tr("pages.bossAssistant.image")}</span>
            <button type="button" onClick={clearAttach} aria-label={tr("tips.removeFile")} className="text-gray-400 hover:text-gray-700">×</button>
          </span>
        )}
        {uploadErr && <span className="text-xs text-red-600">{uploadErr}</span>}
      </div>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={onPickFile}
      />
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
  onCell: (assignee: string, channel: Channel, mode: "ask" | "assisted" | "auto") => void;
  onPauseAll: () => void;
  overnightMode: boolean;
  onOvernight: (on: boolean) => void;
  onClose: () => void;
}) {
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  type Mode = "ask" | "assisted" | "auto";
  const cellMode = (assignee: string, channel: Channel): Mode => {
    const c = cells.find((x) => x.assignee === assignee && x.channel === channel);
    if (c) return c.mode as Mode;
    return global ? "auto" : "ask";
  };
  // Tapping cycles you outward, one step at a time: you approve → Max approves →
  // it just goes. Then back to the strictest, so the loop cannot leave someone
  // on autopilot by accident.
  const nextMode = (m: Mode): Mode => (m === "ask" ? "assisted" : m === "assisted" ? "auto" : "ask");
  // Colour carries the amount of trust being handed over: grey nothing, amber
  // some, green all of it.
  const modeClass: Record<Mode, string> = {
    ask: "border border-gray-200 bg-white text-gray-500",
    assisted: "bg-amber-100 text-amber-900",
    auto: "bg-emerald-100 text-emerald-800",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{tr("boss.approvals.title")}</h2>
          <button type="button" onClick={onClose} aria-label={tr("pages.labels.close")} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <p className="mt-1 text-xs text-gray-500">{tr("boss.approvals.subtitle")}</p>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 p-3">
          <div>
            <p className="text-sm font-medium text-gray-900">{tr("boss.approvals.allChannels")}</p>
            <p className="text-xs text-gray-500">{tr("boss.approvals.allChannelsHelp")}</p>
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
              <p className="mb-2 text-sm font-medium text-gray-900">{tr(`boss.team.${row.assignee}`, { defaultValue: row.assignee })}</p>
              <div className="flex flex-wrap gap-1.5">
                {row.channels.map((ch) => {
                  const mode = cellMode(row.assignee, ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => onCell(row.assignee, ch, nextMode(mode))}
                      title={tr(`boss.approval.${mode}Hint`)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${modeClass[mode]}`}
                    >
                      {tr(`boss.channel.${ch}`)}: {tr(`boss.approval.${mode}`)}
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
            title={tr("boss.approvals.askFirstTitle")}
          >
            ⏸ Pause all autonomy
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{tr("tasks.status.done")}</button>
        </div>
      </div>
    </div>
  );
}

// ── performance (collapsible, lazy) ────────────────────────────────────

const RevenuePanel = nextDynamic(() => import("@/components/dashboard/RevenuePanel").then((m) => m.RevenuePanel), { ssr: false, loading: () => <p className="py-4 text-sm text-gray-400"><LoadingText /></p> });
const PipelineForecastPanel = nextDynamic(() => import("@/components/dashboard/PipelineForecastPanel").then((m) => m.PipelineForecastPanel), { ssr: false, loading: () => <p className="py-4 text-sm text-gray-400"><LoadingText /></p> });
const EmailEngagementPanel = nextDynamic(() => import("@/components/dashboard/EmailEngagementPanel").then((m) => m.EmailEngagementPanel), { ssr: false, loading: () => <p className="py-4 text-sm text-gray-400"><LoadingText /></p> });

function PerformanceSection() {
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50" aria-expanded={open}>
        📈 {tr("boss.businessPerformance")} <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-5">
          <div><h3 className="mb-2 text-sm font-semibold text-gray-900">{tr("boss.panels.revenue")}</h3><RevenuePanel /></div>
          <div><h3 className="mb-1 text-sm font-semibold text-gray-900">{tr("boss.panels.pipeline")}</h3><PipelineForecastPanel /></div>
          <div><h3 className="mb-1 text-sm font-semibold text-gray-900">{tr("boss.panels.emailEngagement")}</h3><EmailEngagementPanel /></div>
        </div>
      )}
    </section>
  );
}
