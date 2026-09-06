"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Check, X, CalendarClock, Pencil, ExternalLink } from "lucide-react";

/**
 * Pull the first link out of a task description so the row UI can render
 * it as a clickable anchor instead of dumping it as plain text. Matches
 * either an absolute http(s) URL (older tasks, external links) OR a
 * relative in-app path (inbound-email review pages now embed
 * `/dashboard/inbound/[id]` so a domain change can't dead-link them).
 * A relative href resolves against the current origin in the browser.
 */
function firstUrlFromDescription(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const match = desc.match(/https?:\/\/[^\s)\]]+|\/dashboard\/[^\s)\]]+/);
  return match ? match[0] : null;
}

/**
 * Unified task shape merging crm_tasks (manual + briefing) with
 * playbook_task_instances (per-anchor batches + coaching). The id
 * is namespaced ("crm:<uuid>" / "pb:<uuid>") so writes can route
 * back to the right backend.
 */
type UnifiedSource = "manual" | "briefing" | "playbook" | "coaching";

type TaskRow = {
  id: string;
  source: UnifiedSource;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  contact_id: string | null;
  contact_name: string | null;
  /** Populated only for source="playbook"|"coaching". */
  playbook?: {
    templateKey: string;
    title: string;
    section: string | null;
    batchId: string | null;
    anchorKind: "transaction" | "open_house" | "contact" | "generic";
    anchorId: string | null;
  };
};

type LeadInfo = { id: string; name: string | null };
type ChartItem = {
  /** Stable slice id from the stats API; the label is translated from it. */
  key?: string;
  name: string;
  value: number;
  color: string;
  /**
   * Optional drill-down breakdown for this slice. When present, the
   * top-level pie renders the slice as clickable; clicking swaps the
   * chart to render `breakdown` until the user clicks "back."
   *
   * Example: top-level "Done" has breakdown [On time, Late]; "Open"
   * has [Overdue, Pending]; "Cancelled" has none (terminal slice).
   */
  breakdown?: ChartItem[];
};
type DayItem = { date: string; label: string; count: number };
type Stats = { completion: ChartItem[]; performedByDay: DayItem[]; performed: number; total: number };

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-amber-100 text-amber-700",
  normal: "bg-blue-100 text-blue-700",
  low: "bg-slate-100 text-slate-600",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-500",
};

/** Module-level (no hook available), so the caller passes its `t` in. */
function timeLabel(iso: string | null, tr: (k: string, o?: Record<string, unknown>) => string) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  const now = Date.now();
  const diff = d.getTime() - now;
  const days = Math.floor(diff / 86_400_000);
  if (days < -1) return tr("tasks.overdueDays", { count: Math.abs(days) });
  if (days === -1) return tr("tasks.yesterday");
  if (days === 0) return tr("tasks.today");
  if (days === 1) return tr("tasks.tomorrow");
  return tr("tasks.inDays", { count: days });
}

/**
 * Pie chart with an optional one-level drill-down.
 *
 * If any top-level slice has a non-empty `breakdown`, that slice is
 * rendered as clickable; clicking swaps the chart to that slice's
 * breakdown (and shows a "← Back" affordance). Slices without a
 * breakdown are inert — useful for terminal categories like
 * "Cancelled" where there's nothing more to expand into.
 */
function MiniPie({ data, title }: { data: ChartItem[]; title: string }) {
  const { t: tr } = useTranslation("dashboard");
  /** Translate by the API key; fall back to the English name it sent. */
  const sliceLabel = (d: ChartItem) => (d.key ? tr(`tasks.chart.${d.key}`, { defaultValue: d.name }) : d.name);
  const [drillName, setDrillName] = useState<string | null>(null);
  const drillSlice = drillName ? data.find((d) => d.name === drillName) : null;
  const drillData = drillSlice?.breakdown ?? null;

  const displayData: ChartItem[] = drillData ?? data;
  const total = displayData.reduce((s, d) => s + d.value, 0);
  const isDrilled = Boolean(drillData);

  const onSliceClick = useCallback(
    (slice: ChartItem) => {
      if (isDrilled) return; // already inside a drill — let "back" handle exit
      if (slice.breakdown && slice.breakdown.length > 0) {
        setDrillName(slice.name);
      }
    },
    [isDrilled],
  );

  const hasAnyDrill = data.some(
    (d) => d.breakdown && d.breakdown.length > 0,
  );

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-500">
          {isDrilled ? (
            <span>
              {title} <span className="text-slate-400">·</span>{" "}
              <span className="text-slate-700 dark:text-slate-300">{drillSlice ? sliceLabel(drillSlice) : drillName}</span>
            </span>
          ) : (
            title
          )}
        </h3>
        {isDrilled && (
          <button
            type="button"
            onClick={() => setDrillName(null)}
            className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
          >
            {tr("tasks.back")}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-[120px] w-[120px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={displayData}
                dataKey="value"
                cx="50%"
                cy="50%"
                outerRadius={50}
                innerRadius={28}
                strokeWidth={1}
              >
                {displayData.map((d, i) => {
                  const clickable =
                    !isDrilled && d.breakdown && d.breakdown.length > 0;
                  return (
                    <Cell
                      key={i}
                      fill={d.color}
                      onClick={clickable ? () => onSliceClick(d) : undefined}
                      style={clickable ? { cursor: "pointer" } : undefined}
                    />
                  );
                })}
              </Pie>
              <Tooltip formatter={((v: number) => v) as never} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1 text-xs">
          {displayData.map((d) => {
            const clickable =
              !isDrilled && d.breakdown && d.breakdown.length > 0;
            const Row = (
              <>
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <span className="text-slate-600 dark:text-slate-400">{sliceLabel(d)}</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{d.value}</span>
                {total > 0 && (
                  <span className="text-slate-400">
                    ({Math.round((d.value / total) * 100)}%)
                  </span>
                )}
              </>
            );
            return clickable ? (
              <button
                key={d.name}
                type="button"
                onClick={() => onSliceClick(d)}
                className="flex items-center gap-2 rounded px-1 -mx-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                title={sliceLabel(d)}
              >
                {Row}
                <span className="text-slate-300">›</span>
              </button>
            ) : (
              <div key={d.name} className="flex items-center gap-2 px-1 -mx-1">
                {Row}
              </div>
            );
          })}
          {!isDrilled && hasAnyDrill && (
            <p className="pt-1 text-[10px] text-slate-400">{tr("pages.tasksPage.clickSlice")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TasksClient({
  leads,
}: {
  leads: LeadInfo[];
}) {
  // Named `tr` — the task rows below already bind `t` in their .map().
  const { t: tr } = useTranslation("dashboard");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [sourceFilter, setSourceFilter] = useState<UnifiedSource | "all">("all");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFields, setAddFields] = useState({ title: "", description: "", priority: "normal", due_at: "", contact_id: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<TaskRow>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const leadMap = new Map(leads.map((l) => [l.id, l.name ?? `Lead #${l.id}`]));

  /**
   * Always fetch the full superset. Tab counts at the top of the
   * page are derived from this set, so they must reflect the agent's
   * true totals regardless of which tab is active — switching tabs is
   * a pure client-side filter, no refetch. Same fix as
   * /dashboard/playbooks: the per-tab fetch made Open/Done/Cancelled
   * counts under-report whenever the agent was on a tab whose query
   * excluded the others.
   */
  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const res = await fetch(`/api/dashboard/tasks/unified?status=all`);
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        tasks?: TaskRow[];
      };
      if (body.ok && Array.isArray(body.tasks)) setTasks(body.tasks);
    } catch {
      /* silent — error banner not worth rendering for read failures */
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  /**
   * Auto-dismiss the action banner ("Task added.", "Updated.", etc.)
   * after 5s — without this the banner sits forever until the next
   * action overwrites it, which made it look like the page was
   * stuck. Matches PlaybooksPanel and the standalone Playbooks page.
   */
  useEffect(() => {
    if (!actionMsg) return;
    const t = window.setTimeout(() => setActionMsg(null), 5000);
    return () => window.clearTimeout(t);
  }, [actionMsg]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/tasks/stats");
      const body = await res.json().catch(() => ({}));
      if (body.ok) setStats(body);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  async function addTask() {
    if (!addFields.title.trim()) return;
    setActionLoading(true); setActionMsg(null);
    try {
      const res = await fetch("/api/dashboard/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addFields.title,
          description: addFields.description || null,
          priority: addFields.priority,
          dueAt: addFields.due_at || null,
          leadId: addFields.contact_id || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? tr("tasks.failed"));
      setAddFields({ title: "", description: "", priority: "normal", due_at: "", contact_id: "" });
      setShowAddForm(false);
      setActionMsg(tr("tasks.taskAdded"));
      window.location.reload();
    } catch (e) { setActionMsg(e instanceof Error ? e.message : tr("tasks.error")); }
    finally { setActionLoading(false); }
  }

  /**
   * Routes the patch to the correct backend based on the task's
   * namespaced id prefix:
   *   - "crm:<uuid>" → PATCH /api/dashboard/tasks
   *   - "pb:<uuid>"  → PATCH /api/dashboard/playbooks/[taskId]
   *                    Supported body fields: completed, cancelled, dueDate.
   *                    Title / description / priority edits aren't
   *                    supported on playbook rows yet — they live on
   *                    the playbook detail flows.
   */
  async function updateTask(id: string, patch: Record<string, unknown>) {
    setActionLoading(true); setActionMsg(null);
    try {
      if (id.startsWith("pb:")) {
        const rawId = id.slice(3);
        const pbBody: Record<string, unknown> = {};
        if (patch.status === "done") pbBody.completed = true;
        else if (patch.status === "open") {
          // Reopening clears whichever closed state the row was in.
          pbBody.completed = false;
          pbBody.cancelled = false;
        } else if (patch.status === "cancelled") pbBody.cancelled = true;
        if (patch.dueAt) {
          // Convert ISO → YYYY-MM-DD; playbook tasks store date only.
          pbBody.dueDate = String(patch.dueAt).slice(0, 10);
        }
        if (Object.keys(pbBody).length === 0) {
          setActionMsg(
            "Title / description / priority edits aren't supported on playbook tasks — open the playbook view to edit.",
          );
          return;
        }
        const res = await fetch(`/api/dashboard/playbooks/${rawId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pbBody),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) throw new Error(body.error ?? tr("tasks.updateFailed"));
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== id) return t;
            const next = { ...t };
            if (patch.status === "done") {
              next.status = "done";
              next.completed_at = new Date().toISOString();
            } else if (patch.status === "cancelled") {
              next.status = "cancelled";
            } else if (patch.status === "open") {
              next.status = "open";
              next.completed_at = null;
            }
            if (typeof patch.dueAt === "string") next.due_at = patch.dueAt;
            return next;
          }),
        );
        setEditingId(null);
        setActionMsg(tr("tasks.updated"));
        loadStats();
        return;
      }
      const rawId = id.startsWith("crm:") ? id.slice(4) : id;
      const res = await fetch("/api/dashboard/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: rawId, ...patch }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? tr("tasks.updateFailed"));
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? ({ ...t, ...patch, status: String(patch.status ?? t.status) } as TaskRow) : t,
        ),
      );
      setEditingId(null);
      setActionMsg(tr("tasks.updated"));
      loadStats();
    } catch (e) { setActionMsg(e instanceof Error ? e.message : tr("tasks.error")); }
    finally { setActionLoading(false); }
  }

  async function markDone(id: string) {
    await updateTask(id, { status: "done" });
  }

  async function markCancelled(id: string) {
    await updateTask(id, { status: "cancelled" });
  }

  /**
   * "Move to" / snooze — push the due date out by `days` (tomorrow,
   * next week). Keeps status open so the task stays on the user's
   * radar; just out of today's view.
   */
  async function snoozeBy(id: string, days: number) {
    const target = new Date();
    target.setDate(target.getDate() + days);
    target.setHours(9, 0, 0, 0);
    await updateTask(id, { dueAt: target.toISOString() });
  }

  function startEdit(task: TaskRow) {
    setEditingId(task.id);
    setEditFields({ title: task.title, description: task.description, priority: task.priority, status: task.status, due_at: task.due_at });
  }

  /**
   * Two-pass client-side filter: first narrow by the active status
   * tab, then narrow further by source chip + search. Source counts
   * are derived from the post-status pool so the chips reflect "how
   * many Manual / Briefing / Playbook / Coaching tasks are in the
   * current tab", not "across all my history" — the latter would
   * include long-closed tasks and stop being actionable.
   */
  const filteredByStatus = useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter((t) => t.status === statusFilter);
  }, [tasks, statusFilter]);

  const filtered = filteredByStatus.filter((t) => {
    if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return t.title.toLowerCase().includes(s) || (t.description ?? "").toLowerCase().includes(s);
  });

  const sourceCounts = useMemo(() => {
    const out = { all: filteredByStatus.length, manual: 0, briefing: 0, playbook: 0, coaching: 0 };
    for (const t of filteredByStatus) out[t.source] += 1;
    return out;
  }, [filteredByStatus]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{tr("tasks.title")}</h1>
          <p className="text-sm text-slate-500">{tr("tasks.openCount", { count: tasks.filter((t) => t.status === "open").length })}</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-3 md:grid-cols-2">
          <MiniPie data={stats.completion} title={tr("tasks.completion")} />
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">{tr("tasks.doneByDay", { count: stats.performed })}</h3>
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.performedByDay} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 8 }} stroke="#9ca3af" interval={4} />
                  <YAxis tick={{ fontSize: 9 }} stroke="#9ca3af" allowDecimals={false} />
                  <Tooltip formatter={((v: number) => [v, tr("tasks.done")]) as never} />
                  <Bar dataKey="count" fill="#22c55e" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons + messages */}
      {actionMsg && <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">{actionMsg}</div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowAddForm((v) => !v)}
          className="rounded-lg bg-[#0072ce] px-3 py-2 text-sm font-medium text-white hover:bg-[#005ca8]">
          {showAddForm ? tr("tasks.cancel") : tr("tasks.addTask")}
        </button>
      </div>

      {/* Add task form */}
      {showAddForm && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tr("tasks.newTask")}</h3>
          <Input value={addFields.title} onChange={(e) => setAddFields((f) => ({ ...f, title: e.target.value }))} placeholder={tr("tasks.titlePlaceholder")} aria-label={tr("tasks.titlePlaceholder")} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={addFields.priority} onChange={(e) => setAddFields((f) => ({ ...f, priority: e.target.value }))} className="w-auto">
              <option value="low">{tr("tasks.priority.low")}</option>
              <option value="normal">{tr("tasks.priority.normal")}</option>
              <option value="high">{tr("tasks.priority.high")}</option>
              <option value="urgent">{tr("tasks.priority.urgent")}</option>
            </Select>
            <Input type="datetime-local" value={addFields.due_at} onChange={(e) => setAddFields((f) => ({ ...f, due_at: e.target.value }))} className="w-auto" />
            <Select value={addFields.contact_id} onChange={(e) => setAddFields((f) => ({ ...f, contact_id: e.target.value }))} className="w-auto">
              <option value="">{tr("tasks.noContact")}</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.name ?? `Lead #${l.id}`}</option>)}
            </Select>
          </div>
          <Textarea value={addFields.description} onChange={(e) => setAddFields((f) => ({ ...f, description: e.target.value }))} placeholder={tr("tasks.notesPlaceholder")} aria-label={tr("tasks.notesPlaceholder")} rows={2} />
          <button type="button" onClick={() => void addTask()} disabled={actionLoading || !addFields.title.trim()}
            className="rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-medium text-white hover:bg-[#005ca8] disabled:opacity-50">
            {actionLoading ? tr("tasks.saving") : tr("tasks.createTask")}
          </button>
        </div>
      )}

      {/* Status tabs — clickable counts replace the old select.
          Always show all four so the agent can see at a glance how
          much of each bucket exists. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700">
        {([
          { key: "open", label: tr("tasks.status.open") },
          { key: "done", label: tr("tasks.status.done") },
          { key: "cancelled", label: tr("tasks.status.cancelled") },
          { key: "all", label: tr("tasks.status.all") },
        ] as const).map((tab) => {
          const count =
            tab.key === "all"
              ? tasks.length
              : tasks.filter((t) => t.status === tab.key).length;
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  active ? "bg-blue-50 text-blue-700" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Source filter chips — applies on top of the status tab.
          All four chips render even when their count is 0 so the
          set is predictable; clicking the active chip re-toggles
          to "All". */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          { key: "all", label: tr("tasks.source.all"), emoji: null },
          { key: "manual", label: tr("tasks.source.manual"), emoji: "✋" },
          { key: "briefing", label: tr("tasks.source.briefing"), emoji: "☀️" },
          { key: "playbook", label: tr("tasks.source.playbook"), emoji: "📋" },
          { key: "coaching", label: tr("tasks.source.coaching"), emoji: "🎯" },
        ] as const).map((chip) => {
          const count = sourceCounts[chip.key];
          const active = sourceFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setSourceFilter(active && chip.key !== "all" ? "all" : chip.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300"
              }`}
            >
              {chip.emoji ? <span aria-hidden>{chip.emoji}</span> : null}
              {chip.label}
              <span className="rounded-full bg-white dark:bg-slate-900/70 px-1 text-[10px] tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("tasks.searchPlaceholder")}
          className="flex-1 min-w-[200px] max-w-sm rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm" />
      </div>

      {/* Tasks table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">{tr("tasks.columns.task")}</th>
                <th className="text-left px-4 py-2.5 font-medium">{tr("tasks.columns.contact")}</th>
                <th className="text-left px-4 py-2.5 font-medium">{tr("tasks.columns.due")}</th>
                <th className="text-left px-4 py-2.5 font-medium">{tr("tasks.columns.priority")}</th>
                <th className="text-left px-4 py-2.5 font-medium">{tr("tasks.columns.status")}</th>
                <th className="text-left px-4 py-2.5 font-medium">{tr("tasks.columns.memo")}</th>
                <th className="text-left px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filtered.map((t) => {
                const isEditing = editingId === t.id;
                if (isEditing) {
                  return (
                    <tr key={t.id} className="bg-blue-50/30">
                      <td className="px-4 py-2"><input value={editFields.title ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, title: e.target.value }))} className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm" /></td>
                      <td className="px-4 py-2 text-xs text-slate-500">{t.contact_id ? leadMap.get(String(t.contact_id)) ?? t.contact_id : "\u2014"}</td>
                      <td className="px-4 py-2"><input type="datetime-local" value={editFields.due_at ? new Date(editFields.due_at).toISOString().slice(0, 16) : ""} onChange={(e) => setEditFields((f) => ({ ...f, due_at: e.target.value ? new Date(e.target.value).toISOString() : null }))} className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm" /></td>
                      <td className="px-4 py-2">
                        <select value={editFields.priority ?? "normal"} onChange={(e) => setEditFields((f) => ({ ...f, priority: e.target.value }))} className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm">
                          <option value="low">{tr("tasks.priority.low")}</option><option value="normal">{tr("tasks.priority.normal")}</option><option value="high">{tr("tasks.priority.high")}</option><option value="urgent">{tr("tasks.priority.urgent")}</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select value={editFields.status ?? t.status} onChange={(e) => setEditFields((f) => ({ ...f, status: e.target.value }))} className="rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm">
                          <option value="open">{tr("tasks.status.open")}</option><option value="done">{tr("tasks.status.done")}</option><option value="cancelled">{tr("tasks.status.cancelled")}</option>
                        </select>
                      </td>
                      <td className="px-4 py-2"><input value={editFields.description ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))} className="w-full rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm" placeholder={tr("pages.labels.notes")} /></td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <button onClick={() => void updateTask(t.id, { title: editFields.title, description: editFields.description, priority: editFields.priority, status: editFields.status, dueAt: editFields.due_at })} disabled={actionLoading} className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 mr-2">{tr("branding.save")}</button>
                        <button onClick={() => setEditingId(null)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">{tr("tasks.cancel")}</button>
                      </td>
                    </tr>
                  );
                }
                const isPlaybookRow = t.source === "playbook" || t.source === "coaching";
                const taskLinkUrl = firstUrlFromDescription(t.description);
                return (
                  <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800">
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        {taskLinkUrl ? (
                          // When the description carries a deep-link
                          // (e.g. inbound-email review page), make the
                          // task title itself the primary affordance
                          // for opening it. Saves the agent a click vs
                          // hunting for the link inside the memo blob.
                          <a
                            href={taskLinkUrl}
                            // Open in a new tab so the task list stays
                            // open behind it — the agent often wants
                            // to come back and tick the task done.
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
                          >
                            {t.title}
                          </a>
                        ) : (
                          <span className="font-medium text-slate-900 dark:text-slate-100">{t.title}</span>
                        )}
                        <SourceChip task={t} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                      {t.contact_name ? t.contact_name : t.contact_id ? leadMap.get(String(t.contact_id)) ?? `#${t.contact_id}` : "\u2014"}
                    </td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                      {t.due_at ? (
                        <span className={t.status === "open" && t.due_at && new Date(t.due_at).getTime() < Date.now() ? "text-red-600 font-medium" : "text-slate-600"}>
                          {timeLabel(t.due_at, tr)}
                        </span>
                      ) : "\u2014"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_COLORS[t.priority] ?? ""}`}>{t.priority}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[t.status] ?? ""}`}>{t.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[200px] truncate">
                      {/* When the description has a URL (inbound-email
                          review pages, etc.), render the link as a
                          clickable anchor so the agent can jump
                          straight there. The rest of the prose still
                          renders alongside, just truncated to fit. */}
                      {taskLinkUrl ? (
                        <a
                          href={taskLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:text-blue-900 hover:underline"
                          title={tr("tasks.openLinked")}
                        >
                          {taskLinkUrl}
                        </a>
                      ) : (
                        t.description ?? "\u2014"
                      )}
                    </td>
                    {/* Row actions \u2014 compact icon buttons. Complete /
                        cancel / move-to (snooze) only render when the
                        task is still open; Edit is always available. */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        {/* "Open" icon — only shown when the task body
                            carries a URL (inbound-email review pages
                            today). Renders before the existing action
                            cluster so the primary affordance is the
                            leftmost icon, not buried behind Done/Edit. */}
                        {taskLinkUrl && (
                          <a
                            href={taskLinkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={tr("tasks.openLinked")}
                            aria-label={tr("tasks.openLinked")}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-blue-700 hover:bg-blue-50 hover:text-blue-900"
                          >
                            <ExternalLink className="h-4 w-4" strokeWidth={2.5} />
                          </a>
                        )}
                        {t.status === "open" && (
                          <TaskIconButton
                            onClick={() => void markDone(t.id)}
                            disabled={actionLoading}
                            title={tr("tasks.markDone")}
                            ariaLabel={tr("tasks.markDone")}
                            tone="success"
                          >
                            <Check className="h-4 w-4" strokeWidth={2.5} />
                          </TaskIconButton>
                        )}
                        {t.status === "open" && (
                          <>
                            <TaskIconButton
                              onClick={() => void markCancelled(t.id)}
                              disabled={actionLoading}
                              title={tr("tasks.cancelTask")}
                              ariaLabel={tr("tasks.cancelTask")}
                              tone="danger"
                            >
                              <X className="h-4 w-4" strokeWidth={2.5} />
                            </TaskIconButton>
                            <SnoozeMenu
                              disabled={actionLoading}
                              onSnooze={(days) => void snoozeBy(t.id, days)}
                            />
                          </>
                        )}
                        {!isPlaybookRow ? (
                          <TaskIconButton
                            onClick={() => startEdit(t)}
                            title={tr("tasks.editTask")}
                            ariaLabel={tr("tasks.editTask")}
                          >
                            <Pencil className="h-4 w-4" strokeWidth={2} />
                          </TaskIconButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {search ? tr("tasks.noMatch") : statusFilter === "open" ? tr("tasks.noOpen") : tr("tasks.none")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-row source chip — a small subtitle under the task title that
 * tells the agent where this task came from. For playbook +
 * coaching rows it also names the playbook + section so they can
 * recognize a batch without leaving the page. Manual tasks render
 * nothing (the absence of a chip = "I made this myself").
 */
function SourceChip({ task }: { task: TaskRow }) {
  const { t: tr } = useTranslation("dashboard");
  if (task.source === "manual") return null;
  if (task.source === "briefing") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
        <span aria-hidden>☀️</span>{tr("pages.tasksPage.morningBriefing")}</span>
    );
  }
  // Playbook + coaching share the same shape (template title + section).
  const title = task.playbook?.title ?? task.source;
  const section = task.playbook?.section;
  const tone =
    task.source === "coaching"
      ? "text-emerald-700"
      : "text-indigo-700";
  const emoji = task.source === "coaching" ? "🎯" : "📋";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${tone}`}>
      <span aria-hidden>{emoji}</span>
      {title}
      {section ? <span className="text-slate-400">· {section}</span> : null}
    </span>
  );
}

/**
 * Compact icon-only button used for the row-level actions on the
 * tasks table. Tone variants paint the icon for affirmative
 * (success / green) or destructive (danger / red) actions; default
 * tone is neutral gray.
 */
function TaskIconButton({
  children,
  onClick,
  title,
  ariaLabel,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
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
        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition disabled:opacity-40 ${toneClasses}`}
    >
      {children}
    </button>
  );
}

/**
 * "Move to" / snooze menu — opens a small popover with quick
 * presets that bump the due date forward without forcing the user
 * into the full edit flow. Click-away closes.
 */
function SnoozeMenu({
  disabled,
  onSnooze,
}: {
  disabled?: boolean;
  onSnooze: (days: number) => void;
}) {
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
    { label: "Tomorrow", days: 1 },
    { label: "In 3 days", days: 3 },
    { label: "Next week", days: 7 },
  ];

  return (
    <div className="relative inline-block" data-snooze-menu>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={tr("tips.moveLater")}
        aria-label={tr("tips.moveTaskLater")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-600 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40"
      >
        <CalendarClock className="h-4 w-4" strokeWidth={2} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-36 origin-top-right overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg ring-1 ring-black/5"
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
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
