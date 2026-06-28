"use client";

import Link from "next/link";
import nextDynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AI_TEAM } from "@/lib/realtorboss/team";
import { LeadProfileDrawer } from "@/components/realtorboss/LeadProfileDrawer";
import BriefingsCard from "@/components/dashboard/BriefingsCard";

// ── API row shapes (subset of fields the Boss Assistant reads) ──────

type TaskItem = {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  lead_name: string | null;
};

type EventItem = { id: string; title: string; lead_name: string | null; starts_at: string };

type HotLead = {
  id: string;
  name: string | null;
  rating: string | null;
  source: string | null;
  engagement_score: number | null;
  last_activity_at: string | null;
  ai_intent: string | null;
};

type TransactionItem = {
  id: string;
  property_address: string;
  status: string;
  contact_name: string | null;
  inspection_deadline: string | null;
  inspection_completed_at: string | null;
  appraisal_deadline: string | null;
  appraisal_completed_at: string | null;
  loan_contingency_deadline: string | null;
  loan_contingency_removed_at: string | null;
  closing_date: string | null;
  task_overdue: number;
};

type CallEvent = {
  id: string;
  contact_name: string | null;
  direction: "inbound" | "outbound";
  status: string;
  from_phone: string | null;
  textback_sent: boolean;
  created_at: string;
};

type SummaryMetrics = {
  totalLeads: number;
  hotLeads: number;
  inactive7Days: number;
  messagesSent: number;
};

type Recommendation = {
  id: string;
  recommendation_type: string;
  title: string;
  summary: string | null;
  reason: string | null;
  recommended_action: string | null;
  action_href: string | null;
  expected_outcome: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  status: "new" | "accepted";
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

const ASSISTANT_LABELS: Record<string, string> = {
  boss_assistant: "Boss Assistant",
  receptionist: "AI Receptionist",
  sales_assistant: "AI Sales Assistant",
  marketing_assistant: "AI Marketing Assistant",
  transaction_assistant: "AI Transaction Assistant",
  accountant: "AI Accountant",
};

// ── Derived views ────────────────────────────────────────────────────

type DeadlineAlert = {
  transactionId: string;
  propertyAddress: string;
  label: string;
  due: Date;
  /** overdue | ≤3 days = high; ≤7 days = medium */
  risk: "high" | "medium";
};

/** Earliest open contingency/closing deadline per active transaction, within 7 days or overdue. */
function deadlineAlerts(transactions: TransactionItem[]): DeadlineAlert[] {
  const now = Date.now();
  const horizon = now + 7 * 24 * 60 * 60 * 1000;
  const alerts: DeadlineAlert[] = [];
  for (const t of transactions) {
    if (t.status !== "active" && t.status !== "pending") continue;
    const candidates: { label: string; date: string | null; done: string | null }[] = [
      { label: "Inspection contingency", date: t.inspection_deadline, done: t.inspection_completed_at },
      { label: "Appraisal deadline", date: t.appraisal_deadline, done: t.appraisal_completed_at },
      { label: "Loan contingency", date: t.loan_contingency_deadline, done: t.loan_contingency_removed_at },
      { label: "Closing", date: t.closing_date, done: null },
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

function fmtDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function BossAssistantClient({ greetingName }: { greetingName: string }) {
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [hotLeads, setHotLeads] = useState<HotLead[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [calls, setCalls] = useState<CallEvent[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [teamStatus, setTeamStatus] = useState<Record<string, "active" | "paused">>({});
  // type → customized assistant name (set on Manage Your AI Team), so activity
  // rows credit the assistant by the name the user gave it.
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  // Lead-profile drawer (constitution: leads are people — read them
  // without leaving the command center).
  const [profileLeadId, setProfileLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

    const [summaryRes, tasksRes, eventsRes, hotRes, txRes, callsRes, recsRes, actsRes, teamRes] = await Promise.all([
      fetch("/api/dashboard/summary").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/tasks?status=open").then((r) => r.json()).catch(() => ({})),
      fetch(`/api/dashboard/calendar/events?from=${todayStart}&to=${todayEnd}`).then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/leads?filter=hot&pageSize=5").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/transactions").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/missed-call/events?limit=20").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/realtorboss/recommendations").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/realtorboss/activities?limit=40").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/realtorboss/team").then((r) => r.json()).catch(() => ({})),
    ]);

    const m = summaryRes?.metrics;
    if (m) {
      setMetrics({
        totalLeads: m.totalLeads ?? 0,
        hotLeads: m.hotLeads ?? 0,
        inactive7Days: m.inactive7Days ?? 0,
        messagesSent: m.messagesSent ?? 0,
      });
    }
    setTasks(((tasksRes?.tasks ?? []) as TaskItem[]).map((t) => ({
      id: t.id, title: t.title, priority: t.priority, due_at: t.due_at, lead_name: t.lead_name ?? null,
    })));
    setEvents(((eventsRes?.events ?? []) as EventItem[]).slice(0, 5));
    setHotLeads(((hotRes?.leads ?? []) as HotLead[]).slice(0, 5));
    setTransactions((txRes?.transactions ?? []) as TransactionItem[]);
    setCalls((callsRes?.events ?? []) as CallEvent[]);
    setRecommendations((recsRes?.recommendations ?? []) as Recommendation[]);
    setActivities((actsRes?.activities ?? []) as ActivityRow[]);
    const statuses: Record<string, "active" | "paused"> = {};
    const names: Record<string, string> = {};
    for (const a of (teamRes?.assistants ?? []) as {
      type: string;
      status: "active" | "paused";
      name?: string;
    }[]) {
      statuses[a.type] = a.status;
      if (a.name) names[a.type] = a.name;
    }
    setTeamStatus(statuses);
    setTeamNames(names);
    setLoading(false);
  }, []);

  /** Mark a recommendation done/dismissed — optimistic removal, server persists. */
  const resolveRecommendation = useCallback(async (id: string, status: "completed" | "dismissed") => {
    setRecommendations((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/dashboard/realtorboss/recommendations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const overdueTasks = useMemo(
    () => tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now()),
    [tasks],
  );
  const activeTransactions = useMemo(
    () => transactions.filter((t) => t.status === "active" || t.status === "pending"),
    [transactions],
  );
  const alerts = useMemo(() => deadlineAlerts(transactions), [transactions]);
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const callsToday = useMemo(
    () => calls.filter((c) => new Date(c.created_at).getTime() >= todayMidnight),
    [calls, todayMidnight],
  );
  // Top priorities come from the boss_recommendations engine
  // (/api/dashboard/realtorboss/recommendations) — synced server-side
  // from CRM signals, with accept/dismiss state that persists.

  // "While you were out" digest — what the AI team did in the last 24h,
  // straight from assistant_activities (no projections).
  const teamDigest = useMemo(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recent = activities.filter((a) => new Date(a.created_at).getTime() >= dayAgo);
    if (recent.length === 0) return null;
    const by = (t: string) => recent.filter((a) => a.assistant_type === t).length;
    const needsYou = recent.filter((a) => a.requires_attention).length;
    const parts: string[] = [];
    const rec = by("receptionist");
    const sales = by("sales_assistant");
    const marketing = by("marketing_assistant");
    const tx = by("transaction_assistant");
    const acct = by("accountant");
    const booked = recent.filter((a) => a.activity_type === "appointment_booked").length;
    if (rec > 0) parts.push(`Receptionist handled ${rec} call${rec === 1 ? "" : "s"}`);
    if (sales > 0) parts.push(`Sales Assistant ran ${sales} follow-up${sales === 1 ? "" : "s"}`);
    if (marketing > 0) parts.push(`Marketing Assistant made ${marketing} touch${marketing === 1 ? "" : "es"}`);
    if (tx > 0) parts.push(`Transaction Assistant flagged ${tx} item${tx === 1 ? "" : "s"}`);
    if (acct > 0) parts.push(`Accountant tracked ${acct} money item${acct === 1 ? "" : "s"}`);
    if (booked > 0) parts.push(`${booked} appointment${booked === 1 ? "" : "s"} booked`);
    if (parts.length === 0) return null;
    // Constitution briefing voice: lead with the team's total output.
    return { total: recent.length, line: parts.join(" · "), needsYou };
  }, [activities]);

  // Per-assistant headline stats for the AI Team cards (today, from real logs).
  const overdueInvoiceRecs = recommendations.filter((r) => r.recommendation_type === "invoice_overdue").length;
  const marketingTouches24h = activities.filter(
    (a) =>
      a.assistant_type === "marketing_assistant" &&
      new Date(a.created_at).getTime() >= Date.now() - 24 * 60 * 60 * 1000,
  ).length;
  const teamStats: Record<string, string> = {
    receptionist: `${callsToday.filter((c) => c.direction === "inbound").length} calls today · ${callsToday.filter((c) => c.textback_sent).length} text-backs`,
    sales_assistant: metrics
      ? `${metrics.hotLeads} hot leads · ${metrics.inactive7Days} quiet leads to revive`
      : "—",
    marketing_assistant:
      marketingTouches24h > 0
        ? `${marketingTouches24h} marketing touch${marketingTouches24h === 1 ? "" : "es"} in 24h`
        : "Posts, plans & sphere nurture",
    transaction_assistant: `${activeTransactions.length} active deals · ${alerts.length} deadline${alerts.length === 1 ? "" : "s"} in 7 days`,
    accountant:
      overdueInvoiceRecs > 0
        ? `${overdueInvoiceRecs} overdue receivable${overdueInvoiceRecs === 1 ? "" : "s"} flagged`
        : "Commission pipeline & expenses",
  };

  return (
    <div className="space-y-4">
      {/* ── Daily briefing header ── */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {greeting}{greetingName ? `, ${greetingName}` : ""}.
        </h1>
        <p className="text-sm text-gray-500">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          {" — here is what needs your attention today."}
        </p>
      </div>

      {/* ── Ask your Boss Assistant — persistent prompt (theme constitution) ── */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("open-ai-chat"))}
        className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-gray-300 hover:bg-gray-50"
      >
        <span className="text-sm" aria-hidden>💬</span>
        <span className="text-sm text-gray-400">
          Ask your Boss Assistant… <span className="hidden sm:inline">&ldquo;What should I focus on today?&rdquo; · &ldquo;Any transactions at risk?&rdquo;</span>
        </span>
      </button>

      {/* ── While you were out — the AI team's last 24h ── */}
      {teamDigest && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50 to-white px-3 py-2">
          <span className="text-sm" aria-hidden>⚡</span>
          <p className="text-xs font-medium text-gray-700">
            <span className="font-semibold text-gray-900">
              Your AI team completed {teamDigest.total} activit{teamDigest.total === 1 ? "y" : "ies"} in the last 24h:
            </span>{" "}
            {teamDigest.line}
          </p>
          {teamDigest.needsYou > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              {teamDigest.needsYou} need{teamDigest.needsYou === 1 ? "s" : ""} your attention
            </span>
          )}
        </div>
      )}

      {/* AI-written morning plan / evening summary (existing briefings engine). */}
      <BriefingsCard />

      {/* ── Daily summary cards ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Total Leads" value={metrics?.totalLeads} href="/dashboard/contacts" />
        <SummaryCard label="Hot Leads" value={metrics?.hotLeads} href="/dashboard/leads?filter=hot" tone="hot" />
        <SummaryCard label="Appointments Today" value={loading ? undefined : events.length} href="/dashboard/calendar" />
        <SummaryCard label="Active Transactions" value={loading ? undefined : activeTransactions.length} href="/dashboard/transactions" />
        <SummaryCard label="Overdue Tasks" value={loading ? undefined : overdueTasks.length} href="/dashboard/tasks" tone={overdueTasks.length > 0 ? "warn" : undefined} />
        <SummaryCard label="Calls Today" value={loading ? undefined : callsToday.length} href="/dashboard/ai-receptionist" />
      </div>

      {/* ── Top priorities (boss_recommendations engine) ── */}
      <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Top Priorities</h2>
          <Link href="/dashboard/ai-team" className="text-xs font-medium text-blue-600 hover:text-blue-800">Manage AI team</Link>
        </div>
        {recommendations.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            {loading ? "Checking your business…" : "Nothing urgent — your AI team has things under control."}
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {recommendations.map((p, i) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{i + 1}. {p.title}</p>
                  <p className="text-xs text-gray-500">
                    {[p.summary, p.reason].filter(Boolean).join(" — ")}
                  </p>
                  {p.expected_outcome && (
                    <p className="mt-0.5 text-xs font-medium text-[#8a6a0e]">
                      → {p.expected_outcome}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {p.related_entity_type === "contact" && p.related_entity_id ? (
                    <button
                      type="button"
                      onClick={() => setProfileLeadId(p.related_entity_id)}
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                    >
                      {p.recommended_action ?? "Open"}
                    </button>
                  ) : p.action_href ? (
                    <Link href={p.action_href} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700">
                      {p.recommended_action ?? "Open"}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void resolveRecommendation(p.id, "completed")}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    title="Mark done"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => void resolveRecommendation(p.id, "dismissed")}
                    className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-50"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── Your AI Team ── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Your AI Team</h2>
        {/* 5 members → 3+2 on xl reads better than a cramped 5-up row. */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {AI_TEAM.filter((a) => a.type !== "boss_assistant").map((a) => {
            // Constitution: assistant cards show role, status, key
            // metrics, and recent activity — checking on an employee.
            const status = teamStatus[a.type] ?? "active";
            const latest = activities.find((act) => act.assistant_type === a.type);
            return (
              <Link key={a.type} href={a.href} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:bg-gray-50">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{a.name}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                    {status}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{a.role} · {a.mission}</p>
                <p className="mt-2 text-xs font-medium text-blue-700">{teamStats[a.type] ?? "—"}</p>
                {latest && (
                  <p className="mt-1.5 truncate border-t border-gray-100 pt-1.5 text-[11px] text-gray-500">
                    <span className="font-medium text-gray-600">Latest:</span> {latest.summary} · {fmtAgo(latest.created_at)}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Hot leads ── */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Hot Leads</h2>
            <Link href="/dashboard/leads?filter=hot" className="text-xs font-medium text-blue-600 hover:text-blue-800">View all</Link>
          </div>
          {hotLeads.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No hot leads right now.</p>
          ) : (
            <div className="space-y-2">
              {hotLeads.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setProfileLeadId(l.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{l.name ?? "Unnamed lead"}</p>
                    <p className="truncate text-xs text-gray-500">
                      {[l.ai_intent, l.source, l.last_activity_at ? `active ${fmtAgo(l.last_activity_at)}` : null]
                        .filter(Boolean)
                        .join(" · ") || "No activity yet"}
                    </p>
                  </div>
                  {typeof l.engagement_score === "number" && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{l.engagement_score}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── Today's appointments ── */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Upcoming Appointments</h2>
            <Link href="/dashboard/calendar" className="text-xs font-medium text-blue-600 hover:text-blue-800">View calendar</Link>
          </div>
          {events.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No appointments today.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{e.title}</p>
                    {e.lead_name && <p className="text-xs text-gray-500">{e.lead_name}</p>}
                  </div>
                  <span className="text-xs font-medium text-blue-600">
                    {new Date(e.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Transaction alerts ── */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Transaction Alerts</h2>
            <Link href="/dashboard/ai-transaction-assistant" className="text-xs font-medium text-blue-600 hover:text-blue-800">View all</Link>
          </div>
          {alerts.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No deadlines in the next 7 days.</p>
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 5).map((a) => (
                <Link key={`${a.transactionId}-${a.label}`} href={`/dashboard/transactions/${a.transactionId}`} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{a.propertyAddress}</p>
                    <p className="text-xs text-gray-500">{a.label}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.risk === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                    {fmtDay(a.due)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── AI team activity (real call logs) ── */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">AI Team Activity</h2>
            <Link href="/dashboard/ai-receptionist" className="text-xs font-medium text-blue-600 hover:text-blue-800">View all</Link>
          </div>
          {activities.length > 0 ? (
            <div className="space-y-2">
              {activities.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {teamNames[a.assistant_type] ?? ASSISTANT_LABELS[a.assistant_type] ?? a.assistant_type} · {a.summary}
                    </p>
                    <p className="text-xs text-gray-500">
                      {a.outcome ?? a.activity_type.replace(/_/g, " ")}
                      {a.requires_attention ? " · needs your attention" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{fmtAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
          ) : calls.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">
              Your AI team is ready — calls answered, texts sent, and deadline alerts will appear here as they work.
            </p>
          ) : (
            <div className="space-y-2">
              {calls.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      AI Receptionist · {c.direction === "inbound" ? "inbound call" : "outbound call"}
                      {c.contact_name ? ` with ${c.contact_name}` : c.from_phone ? ` from ${c.from_phone}` : ""}
                    </p>
                    <p className="text-xs text-gray-500">
                      {c.status}{c.textback_sent ? " · follow-up text sent" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{fmtAgo(c.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Business performance (absorbed the old /dashboard/performance
          page). Collapsed by default — the constitution keeps the command
          center calm; the deep numbers are one click away. ── */}
      <PerformanceSection />

      <LeadProfileDrawer leadId={profileLeadId} onClose={() => setProfileLeadId(null)} />
    </div>
  );
}

const RevenuePanel = nextDynamic(
  () => import("@/components/dashboard/RevenuePanel").then((m) => m.RevenuePanel),
  { ssr: false, loading: () => <p className="py-4 text-sm text-gray-400">Loading…</p> },
);
const PipelineForecastPanel = nextDynamic(
  () => import("@/components/dashboard/PipelineForecastPanel").then((m) => m.PipelineForecastPanel),
  { ssr: false, loading: () => <p className="py-4 text-sm text-gray-400">Loading…</p> },
);
const EmailEngagementPanel = nextDynamic(
  () => import("@/components/dashboard/EmailEngagementPanel").then((m) => m.EmailEngagementPanel),
  { ssr: false, loading: () => <p className="py-4 text-sm text-gray-400">Loading…</p> },
);

function PerformanceSection() {
  // Panels (and their recharts payload) load only when opened.
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
        aria-expanded={open}
      >
        📈 Business performance
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Revenue &amp; commission</h3>
            <RevenuePanel />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Pipeline forecast</h3>
            <p className="mb-2 text-xs text-gray-500">
              What&apos;s on deck — active and pending deals weighted by close-date proximity.
            </p>
            <PipelineForecastPanel />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Email engagement</h3>
            <p className="mb-2 text-xs text-gray-500">
              Opens &amp; clicks across outbound mail.
            </p>
            <EmailEngagementPanel />
          </div>
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number | undefined;
  href: string;
  tone?: "hot" | "warn";
}) {
  const valueClass = tone === "hot" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-gray-900";
  return (
    <Link href={href} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:bg-gray-50">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value ?? "—"}</p>
    </Link>
  );
}
