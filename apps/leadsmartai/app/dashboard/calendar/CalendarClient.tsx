"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Eye, Pencil, X } from "lucide-react";

type CalendarEvent = { id: string; contact_id: string; lead_name: string | null; title: string; starts_at: string; };
// Mirrors /api/dashboard/tasks/unified output. Ids are namespaced
// ("crm:<uuid>" or "pb:<uuid>") so write-paths can route to the right
// backend (see markTaskDone). Contact display name comes through as
// `contact_name`; we keep `lead_name` as an alias for the existing
// dayMap consumer.
type TaskItem = {
  id: string;
  contact_id: string | null;
  lead_name: string | null;
  title: string;
  due_at: string | null;
  priority: string | null;
  status: string;
};
type FollowUp = { contact_id: string; lead_name: string | null; next_contact_at: string; overdue: boolean; };
// Pending draft from /api/dashboard/drafts?status=pending — surfaces on
// the calendar as "items needing your review today" so the agent can
// see review work alongside appointments + tasks.
type DraftItem = {
  id: string;
  contactFullName: string;
  channel: "sms" | "email";
  templateName: string | null;
  createdAt: string;
  scheduledFor: string | null;
  body: string;
};
type DayEntry = {
  type: "event" | "task" | "followup" | "draft";
  id: string;
  title: string;
  leadName: string | null;
  time: string;
  priority?: string;
  status?: string;
  overdue?: boolean;
  channel?: "sms" | "email";
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DOT_COLORS = {
  event: "bg-blue-500",
  task: "bg-green-500",
  followup: "bg-amber-500",
  draft: "bg-purple-500",
};

function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function formatTime(iso: string, locale: string) { return new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }); }

export default function CalendarClient({ leads }: { leads: Array<{ id: string; name: string | null }> }) {
  const { t: tr, i18n } = useTranslation("dashboard");
  // Times were pinned to en-US regardless of the chosen language.
  const timeLocale = intlLocale(i18n.language);
  const [currentMonth, setCurrentMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<"event" | "task">("event");
  const [addFields, setAddFields] = useState({ title: "", leadId: "", startsAt: "", dueAt: "", priority: "normal" });
  const [addLoading, setAddLoading] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [showEvents, setShowEvents] = useState(true);
  const [showTasks, setShowTasks] = useState(true);
  const [showFollowups, setShowFollowups] = useState(true);
  const [showDrafts, setShowDrafts] = useState(true);
  const [gcalStatus, setGcalStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);
  /**
   * Inbound email forwarding panel state. Populated lazily from
   * /api/dashboard/inbound-alias which provisions the alias on first
   * call. Replaces the Gmail OAuth flow for Phase 1 — Google's
   * restricted-scope verification path was costing too much time
   * without a clear unblock.
   */
  const [inboundAlias, setInboundAlias] = useState<{
    address: string;
    domain: string;
    lastReceivedAt: string | null;
    inboundCount: number;
  } | null>(null);
  const [aliasCopied, setAliasCopied] = useState(false);
  const [gcalDisconnecting, setGcalDisconnecting] = useState(false);
  // Month grid (default) vs flat chronological list. Persisted so the
  // user's preference survives navigations.
  const [view, setView] = useState<"month" | "list">(() => {
    if (typeof window === "undefined") return "month";
    try {
      return window.localStorage.getItem("leadsmart.calendar.view") === "list" ? "list" : "month";
    } catch {
      return "month";
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("leadsmart.calendar.view", view);
    } catch {
      // private mode / quota — non-fatal
    }
  }, [view]);

  const loadData = useCallback(async () => {
    const from = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString();
    const to = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const [evRes, tkRes, fuRes, drRes] = await Promise.all([
      fetch(`/api/dashboard/calendar/events?from=${from}&to=${to}`).then((r) => r.json()).catch(() => ({})),
      // Unified endpoint returns CRM tasks AND playbook task instances.
      // The calendar previously used the CRM-only endpoint, which is why
      // playbook tasks (the bulk of real activity) never rendered here.
      fetch("/api/dashboard/tasks/unified?status=all").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/reminders").then((r) => r.json()).catch(() => ({})),
      // Pending drafts — review queue. Surfaces on the calendar so the
      // agent sees review work alongside appointments + tasks.
      fetch("/api/dashboard/drafts?status=pending").then((r) => r.json()).catch(() => ({})),
    ]);
    setEvents(evRes.ok ? (evRes.events ?? []) : []);
    // Map unified shape (id, contact_id, contact_name, title, due_at, priority, status)
    // back to the local TaskItem alias (lead_name) consumed by dayMap below.
    type UnifiedTask = {
      id: string;
      contact_id: string | null;
      contact_name: string | null;
      title: string;
      due_at: string | null;
      priority: string | null;
      status: string;
    };
    const unifiedTasks: UnifiedTask[] = tkRes.ok ? (tkRes.tasks ?? []) : [];
    setTasks(
      unifiedTasks.map((t) => ({
        id: t.id,
        contact_id: t.contact_id,
        lead_name: t.contact_name,
        title: t.title,
        due_at: t.due_at,
        priority: t.priority ?? "normal",
        status: t.status,
      })),
    );
    setFollowups(fuRes.ok ? (fuRes.followUps ?? fuRes.followups ?? []) : []);
    type DraftFromApi = {
      id: string;
      contactFullName?: string;
      channel?: "sms" | "email";
      templateName?: string | null;
      createdAt?: string;
      scheduledFor?: string | null;
      body?: string;
    };
    const apiDrafts: DraftFromApi[] = drRes.ok ? (drRes.drafts ?? []) : [];
    setDrafts(
      apiDrafts.map((d) => ({
        id: d.id,
        contactFullName: d.contactFullName ?? "(no name)",
        channel: d.channel === "email" ? "email" : "sms",
        templateName: d.templateName ?? null,
        createdAt: d.createdAt ?? new Date().toISOString(),
        scheduledFor: d.scheduledFor ?? null,
        body: d.body ?? "",
      })),
    );
  }, [currentMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    fetch("/api/dashboard/inbound-alias")
      .then((r) => r.json())
      .then((b) => {
        if (b.ok) {
          setInboundAlias({
            address: b.address,
            domain: b.domain,
            lastReceivedAt: b.lastReceivedAt ?? null,
            inboundCount: b.inboundCount ?? 0,
          });
        }
      })
      .catch(() => {});

    fetch("/api/dashboard/calendar/google-status").then((r) => r.json()).then((b) => {
      if (b.ok) setGcalStatus({ configured: b.configured, connected: b.connected });
    }).catch(() => {});
  }, []);

  // Build day → entries map
  const dayMap = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const add = (key: string, entry: DayEntry) => {
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    };
    if (showEvents) for (const e of events) {
      const k = dateKey(new Date(e.starts_at));
      add(k, { type: "event", id: e.id, title: e.title, leadName: e.lead_name, time: e.starts_at });
    }
    if (showTasks) for (const t of tasks) {
      if (!t.due_at) continue;
      const k = dateKey(new Date(t.due_at));
      add(k, { type: "task", id: t.id, title: t.title, leadName: t.lead_name, time: t.due_at, priority: t.priority ?? undefined, status: t.status });
    }
    if (showFollowups) for (const f of followups) {
      const k = dateKey(new Date(f.next_contact_at));
      add(k, { type: "followup", id: f.contact_id, title: `Follow up with ${f.lead_name ?? "lead"}`, leadName: f.lead_name, time: f.next_contact_at, overdue: f.overdue });
    }
    if (showDrafts) for (const d of drafts) {
      // Use scheduledFor when set (the day the draft is targeted to send),
      // otherwise createdAt (when the trigger fired and the draft landed
      // in the review queue).
      const slot = d.scheduledFor ?? d.createdAt;
      const k = dateKey(new Date(slot));
      const title = d.templateName
        ? `Review draft: ${d.templateName}`
        : `Review draft to ${d.contactFullName}`;
      add(k, {
        type: "draft",
        id: d.id,
        title,
        leadName: d.contactFullName,
        time: slot,
        channel: d.channel,
      });
    }
    return map;
  }, [events, tasks, followups, drafts, showEvents, showTasks, showFollowups, showDrafts]);

  // Month grid
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((startOffset + daysInMonth) / 7);
  const today = new Date();

  const monthStats = useMemo(() => {
    let evCount = 0, tkCount = 0, fuCount = 0, drCount = 0;
    dayMap.forEach((entries) => {
      for (const e of entries) {
        if (e.type === "event") evCount++;
        else if (e.type === "task") tkCount++;
        else if (e.type === "followup") fuCount++;
        else if (e.type === "draft") drCount++;
      }
    });
    return { events: evCount, tasks: tkCount, followups: fuCount, drafts: drCount };
  }, [dayMap]);

  const selectedEntries = selectedDate ? (dayMap.get(dateKey(selectedDate)) ?? []) : [];

  function prevMonth() { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)); }
  function nextMonth() { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)); }
  function goToday() { const d = new Date(); setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelectedDate(d); }

  async function addItem() {
    setAddLoading(true); setAddMsg(null);
    try {
      if (addType === "event") {
        const res = await fetch("/api/dashboard/calendar/events", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: addFields.title, leadId: addFields.leadId || null, startsAt: addFields.startsAt ? new Date(addFields.startsAt).toISOString() : null }),
        });
        if (!(await res.json()).ok) throw new Error(tr("calendar.failed"));
      } else {
        const res = await fetch("/api/dashboard/tasks", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: addFields.title, leadId: addFields.leadId || null, dueAt: addFields.dueAt ? new Date(addFields.dueAt).toISOString() : null, priority: addFields.priority }),
        });
        if (!(await res.json()).ok) throw new Error(tr("calendar.failed"));
      }
      setAddMsg(tr("calendar.added")); setShowAdd(false);
      setAddFields({ title: "", leadId: "", startsAt: "", dueAt: "", priority: "normal" });
      loadData();
    } catch { setAddMsg(tr("calendar.failedToAdd")); }
    finally { setAddLoading(false); }
  }

  // Routes the patch by the namespaced id the unified endpoint returns:
  //   "crm:<uuid>" → /api/dashboard/tasks (status: done)
  //   "pb:<uuid>"  → /api/dashboard/playbooks/<uuid> (completed: true)
  // Mirrors TasksClient.updateTask so behavior is consistent.
  async function markTaskDone(taskId: string) {
    if (taskId.startsWith("pb:")) {
      const rawId = taskId.slice(3);
      await fetch(`/api/dashboard/playbooks/${rawId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
    } else {
      const rawId = taskId.startsWith("crm:") ? taskId.slice(4) : taskId;
      await fetch("/api/dashboard/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: rawId, status: "done" }),
      });
    }
    loadData();
  }

  async function cancelEvent(eventId: string) {
    await fetch(`/api/dashboard/calendar/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    loadData();
  }

  // Mirrors TasksClient.markCancelled — cancellation routes by id prefix
  // the same way markTaskDone does so the right backend handles it.
  async function markTaskCancelled(taskId: string) {
    if (taskId.startsWith("pb:")) {
      const rawId = taskId.slice(3);
      await fetch(`/api/dashboard/playbooks/${rawId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelled: true }),
      });
    } else {
      const rawId = taskId.startsWith("crm:") ? taskId.slice(4) : taskId;
      await fetch("/api/dashboard/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: rawId, status: "cancelled" }),
      });
    }
    loadData();
  }

  // Mirrors TasksClient.snoozeBy — push the due date out by `days`.
  // Status stays open; the task just leaves today's view. Playbook
  // tasks store date-only (no time component) so we send YYYY-MM-DD;
  // CRM tasks accept ISO with hour set to 9am local.
  async function snoozeTaskBy(taskId: string, days: number) {
    const target = new Date();
    target.setDate(target.getDate() + days);
    target.setHours(9, 0, 0, 0);
    if (taskId.startsWith("pb:")) {
      const rawId = taskId.slice(3);
      const yyyyMmDd = target.toISOString().slice(0, 10);
      await fetch(`/api/dashboard/playbooks/${rawId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: yyyyMmDd }),
      });
    } else {
      const rawId = taskId.startsWith("crm:") ? taskId.slice(4) : taskId;
      await fetch("/api/dashboard/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: rawId, dueAt: target.toISOString() }),
      });
    }
    loadData();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{tr("calendar.title")}</h1>
          <p className="text-sm text-gray-500">
            {monthStats.events} {tr("pages.dashFragments.appointments")} {monthStats.tasks} {tr("pages.dashFragments.tasksSep")} {monthStats.followups} {tr("pages.dashFragments.followUps")} {monthStats.drafts} {tr("pages.dashFragments.drafts")}
          </p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800">
          {showAdd ? tr("calendar.cancel") : tr("calendar.addEvent")}
        </button>
      </div>

      {/* Inbound email forwarding (Phase 1) — replaces the prior
          "Connect Gmail" OAuth flow which was blocked by Google's
          restricted-scope verification path. The agent gets a unique
          forwarding address; they set up a Gmail filter to forward
          listing-related emails there; SendGrid Inbound Parse posts
          to /api/inbound/forwarded-email which classifies intent and
          creates a "Review" task. Phase 2 will layer on AI extraction
          + draft creation for offers / listings / showings. */}
      {inboundAlias && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">
                {tr("calendar.inbound.heading")}
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                {tr("calendar.inbound.body")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="rounded-md border border-blue-200 bg-white px-2 py-1 font-mono text-[12px] text-gray-900">
                  {inboundAlias.address}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(inboundAlias.address);
                    setAliasCopied(true);
                    setTimeout(() => setAliasCopied(false), 1500);
                  }}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  {aliasCopied ? tr("calendar.inbound.copied") : tr("calendar.inbound.copy")}
                </button>
              </div>
              <details className="mt-3 text-xs text-gray-600">
                <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
                  {tr("calendar.inbound.setupSummary")}
                </summary>
                {/* Steps quote Gmail's own menu labels, so the translations use
                    Google's published Chinese strings rather than literal ones. */}
                <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed">
                  <li>{tr("calendar.inbound.step1")}</li>
                  <li>{tr("calendar.inbound.step2")}</li>
                  <li>
                    {tr("calendar.inbound.step3")}{" "}
                    <code className="rounded bg-white px-1 font-mono">offer OR &quot;purchase agreement&quot; OR &quot;listing agreement&quot; OR &quot;showing request&quot;</code>
                  </li>
                  <li>{tr("calendar.inbound.step4")}</li>
                  <li>
                    {tr("calendar.inbound.step5")}{" "}
                    <code className="rounded bg-white px-1 font-mono">{inboundAlias.address}</code>
                  </li>
                  <li>{tr("calendar.inbound.step6")}</li>
                </ol>
                <p className="mt-2 text-[11px] text-gray-500">
                  {tr("calendar.inbound.verifyNote")}
                </p>
              </details>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-blue-200 pt-3 text-[11px] text-gray-600">
            <span>
              <strong className="text-gray-900">{inboundAlias.inboundCount}</strong>{" "}
              email{inboundAlias.inboundCount === 1 ? "" : "s"} imported
            </span>
            {inboundAlias.lastReceivedAt && (
              <span>
                · last received{" "}
                <time dateTime={inboundAlias.lastReceivedAt}>
                  {new Date(inboundAlias.lastReceivedAt).toLocaleString(timeLocale)}
                </time>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Google Calendar integration */}
      {gcalStatus?.configured && (
        <div className={`flex items-center justify-between rounded-xl border p-4 ${gcalStatus.connected ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}`}>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {gcalStatus.connected ? tr("calendar.gcal.connected") : tr("calendar.gcal.connect")}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {gcalStatus.connected
                ? tr("calendar.gcal.connectedHelp")
                : tr("calendar.gcal.connectHelp")}
            </p>
          </div>
          {gcalStatus.connected ? (
            <button
              onClick={async () => {
                setGcalDisconnecting(true);
                await fetch("/api/auth/google-calendar/disconnect", { method: "POST" }).catch(() => {});
                setGcalStatus({ configured: true, connected: false });
                setGcalDisconnecting(false);
              }}
              disabled={gcalDisconnecting}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {gcalDisconnecting ? tr("calendar.gcal.working") : tr("calendar.gcal.disconnect")}
            </button>
          ) : (
            <a
              href="/api/auth/google-calendar"
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >{tr("pages.calendarPage.connect")}</a>
          )}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setAddType("event")} className={`rounded-lg px-3 py-1 text-xs font-medium ${addType === "event" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>{tr("calendar.appointment")}</button>
            <button onClick={() => setAddType("task")} className={`rounded-lg px-3 py-1 text-xs font-medium ${addType === "task" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"}`}>{tr("calendar.task")}</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={addFields.title} onChange={(e) => setAddFields((f) => ({ ...f, title: e.target.value }))} placeholder={tr("calendar.titlePlaceholder")} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <select value={addFields.leadId} onChange={(e) => setAddFields((f) => ({ ...f, leadId: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">{tr("calendar.noContact")}</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? `Lead #${l.id}`}</option>)}
            </select>
            {addType === "event" ? (
              <input type="datetime-local" value={addFields.startsAt} onChange={(e) => setAddFields((f) => ({ ...f, startsAt: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            ) : (
              <>
                <input type="datetime-local" value={addFields.dueAt} onChange={(e) => setAddFields((f) => ({ ...f, dueAt: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <select value={addFields.priority} onChange={(e) => setAddFields((f) => ({ ...f, priority: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="low">{tr("calendar.priority.low")}</option><option value="normal">{tr("calendar.priority.normal")}</option><option value="high">{tr("calendar.priority.high")}</option><option value="urgent">{tr("calendar.priority.urgent")}</option>
                </select>
              </>
            )}
          </div>
          {addMsg && <p className={`text-xs ${addMsg === "Added!" ? "text-green-700" : "text-red-600"}`}>{addMsg}</p>}
          <button onClick={() => void addItem()} disabled={addLoading || !addFields.title.trim()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {addLoading ? tr("calendar.adding") : tr("calendar.add")}
          </button>
        </div>
      )}

      {/* Filters + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
        <button onClick={() => { setShowEvents(true); setShowTasks(true); setShowFollowups(true); setShowDrafts(true); }} className={`rounded-lg px-3 py-1 text-xs font-medium ${showEvents && showTasks && showFollowups && showDrafts ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}>{tr("pages.calendarPage.all")}</button>
        <button onClick={() => { setShowEvents(true); setShowTasks(false); setShowFollowups(false); setShowDrafts(false); }} className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium ${showEvents && !showTasks && !showFollowups && !showDrafts ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
          <span className="h-2 w-2 rounded-full bg-blue-500" /> {tr("calendar.filters.appointments")}
        </button>
        <button onClick={() => { setShowEvents(false); setShowTasks(true); setShowFollowups(false); setShowDrafts(false); }} className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium ${!showEvents && showTasks && !showFollowups && !showDrafts ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          <span className="h-2 w-2 rounded-full bg-green-500" /> {tr("calendar.filters.tasks")}
        </button>
        <button onClick={() => { setShowEvents(false); setShowTasks(false); setShowFollowups(true); setShowDrafts(false); }} className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium ${!showEvents && !showTasks && showFollowups && !showDrafts ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
          <span className="h-2 w-2 rounded-full bg-amber-500" /> {tr("calendar.filters.followups")}
        </button>
        <button onClick={() => { setShowEvents(false); setShowTasks(false); setShowFollowups(false); setShowDrafts(true); }} className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium ${!showEvents && !showTasks && !showFollowups && showDrafts ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
          <span className="h-2 w-2 rounded-full bg-purple-500" /> {tr("calendar.filters.drafts")}
        </button>
        </div>
        {/* Month / List view toggle. Persisted to localStorage so the
            user's preference survives navigations. */}
        <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white text-xs font-medium">
          <button
            onClick={() => setView("month")}
            className={`px-3 py-1 transition ${view === "month" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            aria-pressed={view === "month"}
          >
            {tr("calendar.view.month")}
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1 transition ${view === "list" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            aria-pressed={view === "list"}
          >
            {tr("calendar.view.list")}
          </button>
        </div>
      </div>

      {/* Month grid (default) or chronological list. Both respect the
          filter chips above and stay scoped to the navigated month. */}
      {view === "month" ? (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <button onClick={prevMonth} className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">&larr;</button>
          <div className="text-center">
            <h2 className="text-sm font-semibold text-gray-900">
              {currentMonth.toLocaleDateString(timeLocale, { month: "long", year: "numeric" })}
            </h2>
          </div>
          <div className="flex gap-2">
            <button onClick={goToday} className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">{tr("calendar.today")}</button>
            <button onClick={nextMonth} className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">&rarr;</button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {DAY_KEYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold text-gray-500">{tr(`calendar.days.${d}`)}</div>
          ))}
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: weeks * 7 }).map((_, i) => {
            const dayNum = i - startOffset + 1;
            const isValid = dayNum >= 1 && dayNum <= daysInMonth;
            const date = isValid ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNum) : null;
            const key = date ? dateKey(date) : "";
            const entries = date ? (dayMap.get(key) ?? []) : [];
            const isToday = date && isSameDay(date, today);
            const isSelected = date && selectedDate && isSameDay(date, selectedDate);
            const hasEvents = entries.some((e) => e.type === "event");
            const hasTasks = entries.some((e) => e.type === "task");
            const hasFollowups = entries.some((e) => e.type === "followup");
            const hasDrafts = entries.some((e) => e.type === "draft");

            return (
              <button
                key={i}
                type="button"
                disabled={!isValid}
                onClick={() => date && setSelectedDate(date)}
                onDoubleClick={() => {
                  // Double-click jumps to the list view focused on this day.
                  // ListView reads selectedDate and scrolls + highlights the
                  // matching day-row on mount/when it changes.
                  if (!date) return;
                  setSelectedDate(date);
                  setView("list");
                }}
                title={isValid ? "Click to select · Double-click to open in list view" : undefined}
                className={`min-h-[60px] border-b border-r border-gray-50 px-1 py-1 text-left transition ${
                  !isValid ? "bg-gray-50/50" :
                  isSelected ? "bg-blue-50" :
                  isToday ? "bg-amber-50/50" :
                  "hover:bg-gray-50"
                }`}
              >
                {isValid && (
                  <>
                    <span className={`text-xs ${isToday ? "font-bold text-blue-600" : isSelected ? "font-semibold text-gray-900" : "text-gray-600"}`}>
                      {dayNum}
                    </span>
                    <div className="flex gap-0.5 mt-0.5">
                      {hasEvents && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                      {hasTasks && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                      {hasFollowups && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                      {hasDrafts && <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />}
                    </div>
                    {entries.length > 0 && (
                      <div className="mt-0.5">
                        {entries.slice(0, 2).map((e, j) => (
                          <div key={j} className={`truncate text-[9px] leading-tight ${e.type === "event" ? "text-blue-700" : e.type === "task" ? "text-green-700" : e.type === "draft" ? "text-purple-700" : "text-amber-700"}`}>
                            {e.title}
                          </div>
                        ))}
                        {entries.length > 2 && <div className="text-[9px] text-gray-400">+{entries.length - 2} more</div>}
                      </div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
      ) : (
        <ListView
          locale={timeLocale}
          dayMap={dayMap}
          currentMonth={currentMonth}
          today={today}
          selectedKey={selectedDate ? dateKey(selectedDate) : null}
          markTaskDone={markTaskDone}
          markTaskCancelled={markTaskCancelled}
          snoozeTaskBy={snoozeTaskBy}
          cancelEvent={cancelEvent}
          prevMonth={prevMonth}
          nextMonth={nextMonth}
          goToday={goToday}
        />
      )}

      {/* Day detail panel — only in month view (in list view every
          entry is already shown inline, so the panel would be redundant). */}
      {view === "month" && selectedDate && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">
            {selectedDate.toLocaleDateString(timeLocale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </h3>
          {selectedEntries.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">{tr("calendar.noEvents")}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {selectedEntries.map((entry, i) => (
                <div key={`${entry.type}-${entry.id}-${i}`} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${DOT_COLORS[entry.type]}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{entry.title}</p>
                      <p className="text-xs text-gray-500">
                        {entry.leadName && <span>{entry.leadName} &middot; </span>}
                        {formatTime(entry.time, timeLocale)}
                        {entry.priority && entry.priority !== "normal" && <span className="ml-1 capitalize text-amber-600">{entry.priority}</span>}
                        {entry.overdue && <span className="ml-1 text-red-600">{tr("tasks.chart.overdue")}</span>}
                        {entry.status === "done" && <span className="ml-1 text-green-600">{tr("tasks.status.done")}</span>}
                      </p>
                    </div>
                  </div>
                  <EntryActions
                    entry={entry}
                    markTaskDone={markTaskDone}
                    markTaskCancelled={markTaskCancelled}
                    snoozeTaskBy={snoozeTaskBy}
                    cancelEvent={cancelEvent}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────
// Flat chronological list of every entry in the current month, grouped
// by date. Honors the same filter chips as the month grid (showEvents
// / showTasks / showFollowups / showDrafts, applied upstream when
// dayMap is built). Re-uses the DayEntry type defined at module scope.

function ListView({
  locale,
  dayMap,
  currentMonth,
  today,
  selectedKey,
  markTaskDone,
  markTaskCancelled,
  snoozeTaskBy,
  cancelEvent,
  prevMonth,
  nextMonth,
  goToday,
}: {
  /** Resolved from the language toggle by the parent — see timeLocale. */
  locale: string;
  dayMap: Map<string, DayEntry[]>;
  currentMonth: Date;
  today: Date;
  /**
   * Day key (YYYY-MM-DD) to scroll into view + highlight on mount/change.
   * Set when the user double-clicks a day in month view.
   */
  selectedKey: string | null;
  markTaskDone: (taskId: string) => Promise<void> | void;
  markTaskCancelled: (taskId: string) => Promise<void> | void;
  snoozeTaskBy: (taskId: string, days: number) => Promise<void> | void;
  cancelEvent: (eventId: string) => Promise<void> | void;
  prevMonth: () => void;
  nextMonth: () => void;
  goToday: () => void;
}) {
  const { t: tr, i18n } = useTranslation("dashboard");
  const timeLocale = intlLocale(i18n.language);
  // Sort the date keys ascending so the oldest entries in the month
  // come first — consistent with how a paper calendar reads.
  const sortedKeys = Array.from(dayMap.keys()).sort();

  // Scroll the matching day-row into view when the user double-clicks
  // a day in month view. Lookup by data-day-key attribute so the ref
  // wiring stays declarative.
  useEffect(() => {
    if (!selectedKey) return;
    if (typeof window === "undefined") return;
    const el = document.querySelector<HTMLElement>(`[data-day-key="${selectedKey}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedKey]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <button onClick={prevMonth} className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">&larr;</button>
        <h2 className="text-sm font-semibold text-gray-900">
          {currentMonth.toLocaleDateString(timeLocale, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-2">
          <button onClick={goToday} className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">{tr("calendar.today")}</button>
          <button onClick={nextMonth} className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">&rarr;</button>
        </div>
      </div>

      {sortedKeys.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-gray-400">{tr("pages.calendarPage.nothingScheduled")}</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {sortedKeys.map((key) => {
            const entries = (dayMap.get(key) ?? []).slice().sort((a, b) => a.time.localeCompare(b.time));
            const date = new Date(`${key}T00:00:00`);
            const isToday = isSameDay(date, today);
            const isSelected = selectedKey === key;
            return (
              <div
                key={key}
                data-day-key={key}
                className={`grid grid-cols-[120px_1fr] gap-3 px-4 py-3 transition ${
                  isSelected ? "bg-blue-50 ring-1 ring-blue-200" : ""
                }`}
              >
                <div className={`shrink-0 ${isToday ? "text-blue-700 font-semibold" : "text-gray-700"}`}>
                  <div className="text-xs uppercase tracking-wide">
                    {date.toLocaleDateString(locale, { weekday: "short" })}
                  </div>
                  <div className="text-sm">
                    {date.toLocaleDateString(locale, { month: "short", day: "numeric" })}
                    {isToday ? " · Today" : ""}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {entries.map((entry, i) => (
                    <div
                      key={`${entry.type}-${entry.id}-${i}`}
                      className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${DOT_COLORS[entry.type]}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{entry.title}</p>
                          <p className="text-xs text-gray-500">
                            {entry.leadName && <span>{entry.leadName} &middot; </span>}
                            {formatTime(entry.time, timeLocale)}
                            {entry.priority && entry.priority !== "normal" && (
                              <span className="ml-1 capitalize text-amber-600">{entry.priority}</span>
                            )}
                            {entry.overdue && <span className="ml-1 text-red-600">{tr("tasks.chart.overdue")}</span>}
                            {entry.status === "done" && <span className="ml-1 text-green-600">{tr("tasks.status.done")}</span>}
                          </p>
                        </div>
                      </div>
                      <EntryActions
                        entry={entry}
                        markTaskDone={markTaskDone}
                        markTaskCancelled={markTaskCancelled}
                        snoozeTaskBy={snoozeTaskBy}
                        cancelEvent={cancelEvent}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Per-entry action cluster ──────────────────────────────────────
// Same surface for every entry type (event / task / followup / draft)
// so the user sees consistent placement and styling in both the month
// day-detail panel and the list view. Mirrors TasksClient's
// TaskIconButton + SnoozeMenu so calendar and tasks-page UI agree.
function EntryActions({
  entry,
  markTaskDone,
  markTaskCancelled,
  snoozeTaskBy,
  cancelEvent,
}: {
  entry: DayEntry;
  markTaskDone: (taskId: string) => Promise<void> | void;
  markTaskCancelled: (taskId: string) => Promise<void> | void;
  snoozeTaskBy: (taskId: string, days: number) => Promise<void> | void;
  cancelEvent: (eventId: string) => Promise<void> | void;
}) {
  const { t: tr } = useTranslation("dashboard");
  if (entry.type === "task" && entry.status !== "done") {
    // Edit is CRM-only; playbook tasks don't support title/description
    // edits via the simple PATCH route.
    const isCrm = entry.id.startsWith("crm:");
    return (
      <div className="inline-flex items-center gap-0.5 shrink-0 ml-2">
        <TaskIconButton
          onClick={() => void markTaskDone(entry.id)}
          title={tr("calendar.actions.markDone")}
          ariaLabel={tr("calendar.actions.markDone")}
          tone="success"
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </TaskIconButton>
        <TaskIconButton
          onClick={() => void markTaskCancelled(entry.id)}
          title={tr("calendar.actions.cancelTask")}
          ariaLabel={tr("calendar.actions.cancelTask")}
          tone="danger"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </TaskIconButton>
        <SnoozeMenu onSnooze={(days) => void snoozeTaskBy(entry.id, days)} />
        {isCrm ? (
          <TaskIconButton
            href={`/dashboard/tasks?focus=${encodeURIComponent(entry.id.slice(4))}`}
            title={tr("calendar.actions.editTask")}
            ariaLabel={tr("calendar.actions.editTask")}
          >
            <Pencil className="h-4 w-4" strokeWidth={2} />
          </TaskIconButton>
        ) : null}
      </div>
    );
  }
  if (entry.type === "event") {
    return (
      <div className="inline-flex items-center gap-0.5 shrink-0 ml-2">
        <TaskIconButton
          onClick={() => void cancelEvent(entry.id)}
          title={tr("calendar.actions.cancelAppointment")}
          ariaLabel={tr("calendar.actions.cancelAppointment")}
          tone="danger"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </TaskIconButton>
      </div>
    );
  }
  if (entry.type === "draft") {
    return (
      <div className="inline-flex items-center gap-0.5 shrink-0 ml-2">
        <TaskIconButton
          href="/dashboard/drafts"
          title={tr("calendar.actions.reviewDraft")}
          ariaLabel={tr("calendar.actions.reviewDraft")}
        >
          <Eye className="h-4 w-4" strokeWidth={2} />
        </TaskIconButton>
      </div>
    );
  }
  return null;
}

// Icon button that renders as <button> when given onClick or as <Link>
// when given href. Same shape as TasksClient.TaskIconButton; kept
// in-file rather than lifted to packages/ui because the ergonomics
// of the two surfaces are still in flux.
function TaskIconButton({
  children,
  onClick,
  href,
  title,
  ariaLabel,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  title: string;
  ariaLabel: string;
  disabled?: boolean;
  tone?: "success" | "danger";
}) {
  const toneClasses =
    tone === "success"
      ? "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
      : tone === "danger"
        ? "text-rose-600 hover:bg-rose-50 hover:text-rose-700"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900";
  const className = `inline-flex h-7 w-7 items-center justify-center rounded-md transition disabled:opacity-40 ${toneClasses}`;
  if (href) {
    return (
      <Link href={href} title={title} aria-label={ariaLabel} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  );
}

// Quick-snooze popover: presets bump the due date forward without
// forcing the full edit flow. Same UX as the Tasks page so the user
// learns the pattern in one place.
function SnoozeMenu({ onSnooze }: { onSnooze: (days: number) => void }) {
  const { t: tr } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onAway = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-snooze-menu]")) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const presets: Array<{ label: string; days: number }> = [
    { label: tr("calendar.snooze.tomorrow"), days: 1 },
    { label: "In 3 days", days: 3 },
    { label: tr("calendar.snooze.nextWeek"), days: 7 },
  ];

  return (
    <div className="relative inline-block" data-snooze-menu>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={tr("calendar.actions.moveLater")}
        aria-label={tr("calendar.actions.moveTaskLater")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-600 transition hover:bg-amber-50 hover:text-amber-700"
      >
        <CalendarClock className="h-4 w-4" strokeWidth={2} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-36 origin-top-right overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
        >
          {presets.map((p) => (
            <button
              key={p.days}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSnooze(p.days);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
