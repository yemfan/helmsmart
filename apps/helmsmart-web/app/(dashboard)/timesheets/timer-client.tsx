"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import {
  Play, Square, Plus, Trash2, Clock, DollarSign,
  ChevronDown, Check, AlertCircle, FileText, FolderOpen,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import {
  startTimer, stopTimer, createTimeEntry, deleteTimeEntry,
  type TimeEntry,
} from "@/lib/actions/time-entries";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectOption = { id: string; name: string; color: string };
type TFunc = (key: string, opts?: Record<string, unknown>) => string;

// ─── Color dot map ────────────────────────────────────────────────────────────

const COLOR_DOTS: Record<string, string> = {
  indigo:  "bg-indigo-500",
  emerald: "bg-emerald-500",
  rose:    "bg-rose-500",
  amber:   "bg-amber-500",
  violet:  "bg-violet-500",
  slate:   "bg-slate-400",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(minutes: number | null, t: TFunc): string {
  const total = minutes ?? 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return t("timesheets.durationMinutes", { minutes: m });
  return t("timesheets.durationHoursMinutes", { hours: h, minutes: m });
}

function money(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(n);
}

function dayLabel(iso: string, t: TFunc, locale: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t("timesheets.today");
  if (d.toDateString() === yesterday.toDateString()) return t("timesheets.yesterday");
  return d.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });
}

function groupByDay(entries: TimeEntry[]): { day: string; entries: TimeEntry[] }[] {
  const map = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const day = e.started_at.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  return Array.from(map.entries()).map(([day, entries]) => ({ day, entries }));
}

function clientLabel(
  entry: TimeEntry,
  clients: { id: string; first_name: string | null; last_name: string | null; company: string | null }[],
  t: TFunc
): string {
  const c = entry.clients
    ? entry.clients
    : clients.find((cl) => cl.id === entry.client_id);
  if (!c) return t("timesheets.noClient");
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || t("timesheets.clientFallback");
}

function projectLabel(entry: TimeEntry): string | null {
  // Prefer FK-joined project name, fall back to legacy text field
  return entry.projects?.name ?? entry.project ?? null;
}

// ─── Add entry modal ──────────────────────────────────────────────────────────

function AddEntryModal({
  clients,
  projects,
  defaultHourlyRate,
  onClose,
  onCreated,
}: {
  clients: { id: string; first_name: string | null; last_name: string | null; company: string | null }[];
  projects: ProjectOption[];
  defaultHourlyRate: number | null;
  onClose: () => void;
  onCreated: (entry: Partial<TimeEntry>) => void;
}) {
  const { t } = useTranslation("projects");
  const [description, setDescription] = useState("");
  const [clientId, setClientId]       = useState("");
  const [projectId, setProjectId]     = useState("");
  const [date, setDate]               = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours]             = useState("0");
  const [minutes, setMinutes]         = useState("0");
  const [billable, setBillable]       = useState(true);
  const [hourlyRate, setHourlyRate]   = useState(defaultHourlyRate?.toString() ?? "");
  const [isPending, startTransition]  = useTransition();
  const [error, setError]             = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const totalMins = parseInt(hours || "0") * 60 + parseInt(minutes || "0");
    if (totalMins <= 0) { setError(t("timesheets.modal.durationRequired")); return; }
    if (!description.trim()) { setError(t("timesheets.modal.descriptionRequired")); return; }

    startTransition(async () => {
      try {
        await createTimeEntry({
          description: description.trim(),
          clientId: clientId || null,
          projectId: projectId || null,
          startedAt: date + "T09:00:00",
          durationMinutes: totalMins,
          billable,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
        });
        const proj = projects.find((p) => p.id === projectId);
        onCreated({
          description: description.trim(),
          client_id: clientId || null,
          project_id: projectId || null,
          projects: proj ? { name: proj.name, color: proj.color } : null,
          started_at: date + "T09:00:00.000Z",
          duration_minutes: totalMins,
          billable,
          hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
          invoiced: false,
          ended_at: new Date(new Date(date + "T09:00:00").getTime() + totalMins * 60000).toISOString(),
        });
        onClose();
      } catch {
        setError(t("timesheets.modal.saveFailed"));
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4"
      >
        <h2 className="text-base font-semibold text-slate-800">{t("timesheets.modal.title")}</h2>

        {error && (
          <p className="text-xs text-rose-600 flex items-center gap-1" role="alert">
            <AlertCircle className="w-3.5 h-3.5" />{error}
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("timesheets.modal.description")}</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("timesheets.modal.descriptionPlaceholder")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("timesheets.modal.client")}</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">{t("timesheets.modal.noClient")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.company}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("timesheets.modal.project")}</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">{t("timesheets.modal.noProject")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("timesheets.modal.date")}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("timesheets.modal.hours")}</label>
            <input
              type="number"
              min="0"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("timesheets.modal.minutes")}</label>
            <input
              type="number"
              min="0"
              max="59"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              className="rounded accent-indigo-600"
            />
            <span className="text-sm text-slate-700">{t("timesheets.modal.billable")}</span>
          </label>
          {billable && (
            <div className="flex-1">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder={t("timesheets.modal.hourlyRatePlaceholder")}
                  className="w-full rounded-lg border border-slate-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {t("common:actions.cancel")}
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? t("common:status.saving") : t("timesheets.modal.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Timer bar ────────────────────────────────────────────────────────────────

function TimerBar({
  activeTimer,
  clients,
  projects,
  defaultHourlyRate,
  onTimerStopped,
  onTimerStarted,
}: {
  activeTimer: TimeEntry | null;
  clients: { id: string; first_name: string | null; last_name: string | null; company: string | null }[];
  projects: ProjectOption[];
  defaultHourlyRate: number | null;
  onTimerStopped: () => void;
  onTimerStarted: (id: string) => void;
}) {
  const { t } = useTranslation("projects");
  const [description, setDescription] = useState(activeTimer?.description ?? "");
  const [clientId, setClientId]       = useState(activeTimer?.client_id ?? "");
  const [projectId, setProjectId]     = useState(activeTimer?.project_id ?? "");
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [isPending, startTransition]  = useTransition();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync elapsed time when active timer is mounted
  useEffect(() => {
    if (activeTimer) {
      const elapsed = Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 1000);
      setLiveSeconds(elapsed);
      intervalRef.current = setInterval(() => setLiveSeconds((s) => s + 1), 1000);
    } else {
      setLiveSeconds(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeTimer?.id]);

  function fmtLive(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  function handleStart() {
    startTransition(async () => {
      const id = await startTimer({
        description: description.trim() || t("timesheets.timerDefaultDescription"),
        clientId: clientId || null,
        projectId: projectId || null,
        billable: true,
        hourlyRate: defaultHourlyRate,
      });
      onTimerStarted(id);
    });
  }

  function handleStop() {
    if (!activeTimer) return;
    startTransition(async () => {
      await stopTimer(activeTimer.id);
      onTimerStopped();
    });
  }

  const activeProjectColor = activeTimer?.projects?.color
    ?? projects.find((p) => p.id === activeTimer?.project_id)?.color;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center gap-3 shadow-sm">
      {/* Active project color indicator */}
      {(activeTimer?.project_id || projectId) && (
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            COLOR_DOTS[activeProjectColor ?? projects.find((p) => p.id === projectId)?.color ?? "slate"] ?? "bg-slate-400"
          }`}
        />
      )}

      {/* Description */}
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !activeTimer) handleStart(); }}
        placeholder={t("timesheets.timerPlaceholder")}
        disabled={!!activeTimer}
        className="flex-1 min-w-[10rem] text-sm text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none disabled:cursor-default"
      />

      {/* Project dropdown */}
      <div className="relative">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={!!activeTimer}
          aria-label={t("timesheets.modal.project")}
          className="appearance-none text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-default max-w-[120px]"
        >
          <option value="">{t("timesheets.noProject")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <FolderOpen className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
      </div>

      {/* Client dropdown */}
      <div className="relative">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={!!activeTimer}
          aria-label={t("timesheets.modal.client")}
          className="appearance-none text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-default"
        >
          <option value="">{t("timesheets.noClient")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.company}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
      </div>

      {/* Live clock */}
      {activeTimer && (
        <span className="font-mono text-base text-indigo-600 font-semibold tabular-nums min-w-[70px] text-right">
          {fmtLive(liveSeconds)}
        </span>
      )}

      {/* Start / Stop */}
      {activeTimer ? (
        <button
          onClick={handleStop}
          disabled={isPending}
          className="w-9 h-9 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-600 flex items-center justify-center transition-colors disabled:opacity-50"
          title={t("timesheets.stopTimer")}
        >
          <Square className="w-4 h-4 fill-rose-600" />
        </button>
      ) : (
        <button
          onClick={handleStart}
          disabled={isPending}
          className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition-colors disabled:opacity-50"
          title={t("timesheets.startTimer")}
        >
          <Play className="w-4 h-4 fill-white ml-0.5" />
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initialEntries: TimeEntry[];
  initialActiveTimer: TimeEntry | null;
  initialStats: {
    totalMinutes: number;
    billableMinutes: number;
    billableAmount: number;
    uninvoicedAmount: number;
  };
  clients: { id: string; first_name: string | null; last_name: string | null; company: string | null }[];
  projects: ProjectOption[];
  defaultHourlyRate: number | null;
  weekFrom: string;
  weekTo: string;
}

export function TimerClient({
  initialEntries,
  initialActiveTimer,
  initialStats,
  clients,
  projects,
  defaultHourlyRate,
  weekFrom,
  weekTo,
}: Props) {
  const { t, i18n } = useTranslation("projects");
  const locale = intlLocale(i18n.language);
  const router = useRouter();
  const [entries, setEntries] = useState<TimeEntry[]>(initialEntries);
  const [activeTimer, setActiveTimer] = useState<TimeEntry | null>(initialActiveTimer);
  const [stats, setStats] = useState(initialStats);
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const grouped = groupByDay(entries.filter((e) => e.ended_at));

  function handleTimerStopped() {
    setActiveTimer(null);
    router.refresh();
  }

  function handleTimerStarted(_id: string) {
    router.refresh();
  }

  function handleDelete(entryId: string) {
    setDeletingId(entryId);
    startTransition(async () => {
      await deleteTimeEntry(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      setDeletingId(null);
    });
  }

  function handleCreated(partial: Partial<TimeEntry>) {
    const fake: TimeEntry = {
      id: crypto.randomUUID(),
      client_id: partial.client_id ?? null,
      project: partial.project ?? null,
      project_id: partial.project_id ?? null,
      description: partial.description ?? "",
      started_at: partial.started_at ?? new Date().toISOString(),
      ended_at: partial.ended_at ?? null,
      duration_minutes: partial.duration_minutes ?? 0,
      billable: partial.billable ?? true,
      hourly_rate: partial.hourly_rate ?? null,
      invoiced: false,
      invoice_id: null,
      created_at: new Date().toISOString(),
      clients: clients.find((c) => c.id === partial.client_id) ?? null,
      projects: partial.projects ?? null,
    };
    setEntries((prev) => [fake, ...prev]);
    if (fake.duration_minutes) {
      const added = fake.billable ? (fake.duration_minutes / 60) * (fake.hourly_rate ?? 0) : 0;
      setStats((s) => ({
        totalMinutes: s.totalMinutes + fake.duration_minutes!,
        billableMinutes: fake.billable ? s.billableMinutes + fake.duration_minutes! : s.billableMinutes,
        billableAmount: s.billableAmount + added,
        uninvoicedAmount: s.uninvoicedAmount + added,
      }));
    }
  }

  const weekLabel = (() => {
    const f = new Date(weekFrom + "T00:00:00");
    const to = new Date(weekTo   + "T00:00:00");
    return t("timesheets.weekRange", {
      from: f.toLocaleDateString(locale, { month: "short", day: "numeric" }),
      to: to.toLocaleDateString(locale, { month: "short", day: "numeric" }),
    });
  })();

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("timesheets.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t("timesheets.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t("timesheets.addEntry")}
        </button>
      </div>

      {/* Timer bar */}
      <div className="mb-6">
        <TimerBar
          activeTimer={activeTimer}
          clients={clients}
          projects={projects}
          defaultHourlyRate={defaultHourlyRate}
          onTimerStopped={handleTimerStopped}
          onTimerStarted={handleTimerStarted}
        />
      </div>

      {/* Stats — this week */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            key: "week",
            label: t("timesheets.thisWeek"),
            value: weekLabel,
            sub: "",
            icon: <Clock className="w-4 h-4 text-slate-400" />,
          },
          {
            key: "hours",
            label: t("timesheets.totalHours"),
            value: fmtDuration(stats.totalMinutes, t),
            sub: t("timesheets.billableSub", { duration: fmtDuration(stats.billableMinutes, t) }),
            icon: <Clock className="w-4 h-4 text-indigo-400" />,
          },
          {
            key: "billable",
            label: t("timesheets.billableAmount"),
            value: money(stats.billableAmount, locale),
            sub: t("timesheets.atTrackedRates"),
            icon: <DollarSign className="w-4 h-4 text-emerald-400" />,
          },
          {
            key: "uninvoiced",
            label: t("timesheets.uninvoiced"),
            value: money(stats.uninvoicedAmount, locale),
            sub: stats.uninvoicedAmount > 0 ? t("timesheets.readyToInvoice") : t("timesheets.allInvoiced"),
            icon: <FileText className="w-4 h-4 text-amber-400" />,
          },
        ].map(({ key, label, value, sub, icon }) => (
          <div key={key} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
              {icon}
            </div>
            <p className="text-lg font-semibold text-slate-800 tabular-nums">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Entry list */}
      {grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center py-16 text-center">
          <Clock className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500 mb-1">{t("timesheets.empty")}</p>
          <p className="text-xs text-slate-400">
            {t("timesheets.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ day, entries: dayEntries }) => {
            const dayMins = dayEntries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
            return (
              <div key={day}>
                {/* Day header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {dayLabel(dayEntries[0].started_at, t, locale)}
                  </span>
                  <span className="text-xs text-slate-400 tabular-nums font-mono">
                    {fmtDuration(dayMins, t)}
                  </span>
                </div>

                {/* Entries for this day */}
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-50 overflow-hidden">
                  {dayEntries.map((entry) => {
                    const billableAmt = entry.billable && entry.hourly_rate && entry.duration_minutes
                      ? (entry.duration_minutes / 60) * entry.hourly_rate
                      : null;
                    const projName = projectLabel(entry);
                    const projColor = entry.projects?.color ?? "slate";

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-4 px-5 py-3.5 group"
                      >
                        {/* Billable dot */}
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            entry.billable ? "bg-emerald-400" : "bg-slate-300"
                          }`}
                          title={entry.billable ? t("timesheets.billable") : t("timesheets.nonBillable")}
                        />

                        {/* Description + meta */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {entry.description || <span className="italic text-slate-400">{t("timesheets.noDescription")}</span>}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-slate-400 truncate">
                              {entry.client_id ? clientLabel(entry, clients, t) : t("timesheets.noClient")}
                            </p>
                            {projName && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <div className={`w-1.5 h-1.5 rounded-full ${COLOR_DOTS[projColor] ?? "bg-slate-400"}`} />
                                  {projName}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Amount */}
                        {billableAmt !== null && (
                          <span className="text-xs font-medium text-emerald-700 tabular-nums flex-shrink-0">
                            {money(billableAmt, locale)}
                          </span>
                        )}

                        {/* Duration */}
                        <span className="text-sm font-mono text-slate-600 tabular-nums flex-shrink-0 w-14 text-right">
                          {fmtDuration(entry.duration_minutes, t)}
                        </span>

                        {/* Invoiced badge */}
                        {entry.invoiced && (
                          <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5" />
                            {t("timesheets.invoiced")}
                          </span>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-500 transition-all rounded-lg hover:bg-rose-50 flex-shrink-0 disabled:opacity-30"
                          title={t("timesheets.deleteEntry")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add entry modal */}
      {showAdd && (
        <AddEntryModal
          clients={clients}
          projects={projects}
          defaultHourlyRate={defaultHourlyRate}
          onClose={() => setShowAdd(false)}
          onCreated={(partial) => {
            handleCreated(partial);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}
