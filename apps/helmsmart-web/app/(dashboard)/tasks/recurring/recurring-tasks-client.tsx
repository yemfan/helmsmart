"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Repeat, X, AlertCircle, Play, Pause, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import {
  createRecurringTask,
  setRecurringTaskStatus,
  deleteRecurringTask,
  type RecurringTask,
  type RecurringFrequency,
  type TaskPriority,
} from "@/lib/actions/recurring-tasks";

type ClientLite = { id: string; first_name: string | null; last_name: string | null; company: string | null };

const FREQUENCIES: RecurringFrequency[] = ["weekly", "monthly", "quarterly", "annually"];

const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  urgent: "bg-rose-50 text-rose-700",
  high:   "bg-amber-50 text-amber-700",
  normal: "bg-slate-100 text-slate-500",
  low:    "bg-slate-100 text-slate-400",
};
const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

function clientName(c: ClientLite | { first_name: string | null; last_name: string | null; company: string | null } | null | undefined): string {
  if (!c) return "";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "";
}
function defaultNextRun(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

// ─── New recurring task modal ───────────────────────────────────────────────────

function NewRecurringTaskModal({
  clients,
  onClose,
  onSaved,
}: {
  clients: ClientLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("tasks");
  const [title, setTitle]         = useState("");
  const [notes, setNotes]         = useState("");
  const [clientId, setClientId]   = useState("");
  const [priority, setPriority]   = useState<TaskPriority>("normal");
  const [frequency, setFreq]      = useState<RecurringFrequency>("weekly");
  const [nextRunDate, setNextRun] = useState(defaultNextRun());
  const [error, setError]         = useState("");
  const [isPending, start]        = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError(t("recurring.modal.titleRequired")); return; }
    if (!nextRunDate) { setError(t("recurring.modal.firstDateRequired")); return; }
    setError("");
    start(async () => {
      try {
        await createRecurringTask({
          title: title.trim(),
          notes: notes.trim() || null,
          clientId: clientId || null,
          priority,
          frequency,
          nextRunDate,
        });
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("recurring.modal.createFailed"));
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-800">{t("recurring.modal.title")}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <p className="text-xs text-rose-600 flex items-center gap-1" role="alert"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("recurring.modal.titleLabel")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("recurring.modal.titlePlaceholder")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("recurring.modal.notes")}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("recurring.modal.notesPlaceholder")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("recurring.modal.client")}</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">{t("recurring.modal.noClient")}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{clientName(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("recurring.modal.priority")}</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("recurring.modal.frequency")}</label>
            <select value={frequency} onChange={(e) => setFreq(e.target.value as RecurringFrequency)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`frequency.${f}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("recurring.modal.firstDate")}</label>
            <input type="date" value={nextRunDate} onChange={(e) => setNextRun(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          {t("recurring.modal.hint")}
        </p>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">{t("common:actions.cancel")}</button>
          <button type="submit" disabled={isPending} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {isPending ? t("common:status.saving") : t("recurring.modal.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────────────────

function RecurringRow({
  rec,
  onChanged,
  onDeleted,
}: {
  rec: RecurringTask;
  onChanged: (id: string, status: "active" | "paused") => void;
  onDeleted: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("tasks");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, start] = useTransition();
  const paused = rec.status === "paused";
  const priorityCls = PRIORITY_CLASSES[rec.priority] ?? PRIORITY_CLASSES.normal;

  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(intlLocale(i18n.language), { month: "short", day: "numeric", year: "numeric" });

  function toggleStatus() {
    const next = paused ? "active" : "paused";
    start(async () => {
      await setRecurringTaskStatus(rec.id, next);
      onChanged(rec.id, next);
    });
  }
  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    start(async () => {
      await deleteRecurringTask(rec.id);
      onDeleted(rec.id);
    });
  }

  return (
    <div className="flex items-center gap-4 px-5 py-4 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-800 truncate">{rec.title}</p>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
            {t(`frequency.${rec.frequency}`)}
          </span>
          {rec.priority !== "normal" && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${priorityCls}`}>{t(`priority.${rec.priority}`)}</span>
          )}
          {paused && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{t("recurring.paused")}</span>}
        </div>
        <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {clientName(rec.clients) && <span>{clientName(rec.clients)}</span>}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {paused ? t("recurring.paused") : t("recurring.next", { date: fmtDate(rec.next_run_date) })}
          </span>
          {rec.last_generated_at && (
            <span>
              {t("recurring.last", {
                date: new Date(rec.last_generated_at).toLocaleDateString(intlLocale(i18n.language), { month: "short", day: "numeric" }),
              })}
            </span>
          )}
        </p>
      </div>

      <button
        onClick={toggleStatus}
        disabled={isPending}
        title={paused ? t("recurring.resume") : t("recurring.pause")}
        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50 transition-colors"
      >
        {paused ? <><Play className="w-3 h-3" /> {t("recurring.resume")}</> : <><Pause className="w-3 h-3" /> {t("recurring.pause")}</>}
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
          confirmDelete ? "bg-rose-100 text-rose-700 hover:bg-rose-200" : "text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"
        }`}
      >
        {confirmDelete ? t("recurring.confirm") : t("common:actions.delete")}
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────────

interface Props {
  initialRecurring: RecurringTask[];
  clients: ClientLite[];
}

export function RecurringTasksClient({ initialRecurring, clients }: Props) {
  const { t } = useTranslation("tasks");
  const [recurring, setRecurring] = useState<RecurringTask[]>(initialRecurring);
  const [showNew, setShowNew]     = useState(false);

  const activeCount = recurring.filter((r) => r.status === "active").length;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("recurring.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("recurring.subtitle", { count: activeCount })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/tasks" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {t("recurring.backToTasks")}
          </Link>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" />
            {t("recurring.new")}
          </button>
        </div>
      </div>

      {recurring.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
          <Repeat className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500 mb-1">{t("recurring.emptyTitle")}</p>
          <p className="text-xs text-slate-400 mb-4 max-w-sm">
            {t("recurring.emptyBody")}
          </p>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" />
            {t("recurring.createFirst")}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-50">
          {recurring.map((r) => (
            <RecurringRow
              key={r.id}
              rec={r}
              onChanged={(id, status) => setRecurring((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)))}
              onDeleted={(id) => setRecurring((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4">
        {t("recurring.footnote")}
      </p>

      {showNew && (
        <NewRecurringTaskModal
          clients={clients}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
