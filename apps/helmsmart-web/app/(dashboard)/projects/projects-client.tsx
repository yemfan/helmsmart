"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Folder, X, ChevronRight, Clock, DollarSign, AlertCircle, Repeat, LayoutTemplate } from "lucide-react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { createProject, deleteProject, type ProjectColor, type ProjectWithPnL } from "@/lib/actions/projects";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLOR_CLASSES: Record<ProjectColor, { dot: string; bg: string; text: string }> = {
  indigo:  { dot: "bg-indigo-500",  bg: "bg-indigo-50",  text: "text-indigo-700" },
  emerald: { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
  rose:    { dot: "bg-rose-500",    bg: "bg-rose-50",    text: "text-rose-700" },
  amber:   { dot: "bg-amber-500",   bg: "bg-amber-50",   text: "text-amber-700" },
  violet:  { dot: "bg-violet-500",  bg: "bg-violet-50",  text: "text-violet-700" },
  slate:   { dot: "bg-slate-400",   bg: "bg-slate-100",  text: "text-slate-600" },
};

const STATUS_FILTERS = ["active", "paused", "completed", "all"] as const;

function clientName(c: { first_name: string | null; last_name: string | null; company: string | null } | null | undefined): string {
  if (!c) return "";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || "";
}

function money(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ─── New project modal ────────────────────────────────────────────────────────

function NewProjectModal({
  clients,
  onClose,
  onCreated,
}: {
  clients: { id: string; first_name: string | null; last_name: string | null; company: string | null }[];
  onClose: () => void;
  onCreated: (p: ProjectWithPnL) => void;
}) {
  const { t } = useTranslation("projects");
  const [name, setName]           = useState("");
  const [description, setDesc]    = useState("");
  const [clientId, setClientId]   = useState("");
  const [color, setColor]         = useState<ProjectColor>("indigo");
  const [budgetHours, setBudH]    = useState("");
  const [hourlyRate, setRate]     = useState("");
  const [startDate, setStart]     = useState("");
  const [endDate, setEnd]         = useState("");
  const [error, setError]         = useState("");
  const [isPending, start]        = useTransition();

  const COLORS: ProjectColor[] = ["indigo", "emerald", "rose", "amber", "violet", "slate"];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(t("newProject.nameRequired")); return; }
    setError("");
    start(async () => {
      try {
        const id = await createProject({
          name: name.trim(),
          description: description.trim() || null,
          clientId: clientId || null,
          color,
          budgetHours: budgetHours ? parseFloat(budgetHours) : null,
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : null,
          startDate: startDate || null,
          endDate: endDate || null,
        });
        onCreated({
          id,
          name: name.trim(),
          description: description.trim() || null,
          client_id: clientId || null,
          status: "active",
          color,
          budget_hours: budgetHours ? parseFloat(budgetHours) : null,
          budget_amount: null,
          hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
          start_date: startDate || null,
          end_date: endDate || null,
          created_at: new Date().toISOString(),
          clients: clients.find((c) => c.id === clientId) ?? null,
          pnl: { revenue: 0, laborCost: 0, expensesTotal: 0, profit: 0, margin: null },
        });
        onClose();
      } catch (e) {
        console.error("create project", e);
        setError(t("newProject.createFailed"));
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">{t("newProject.title")}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <p className="text-xs text-rose-600 flex items-center gap-1" role="alert"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("newProject.nameLabel")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("newProject.namePlaceholder")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("newProject.description")}</label>
          <textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder={t("newProject.descriptionPlaceholder")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("newProject.client")}</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">{t("newProject.noClient")}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{clientName(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("newProject.color")}</label>
            <div className="flex items-center gap-2 mt-1">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-6 h-6 rounded-full ${COLOR_CLASSES[c].dot} transition-transform ${color === c ? "scale-125 ring-2 ring-offset-1 ring-slate-400" : ""}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("newProject.budgetHours")}</label>
            <input type="number" min="0" step="0.5" value={budgetHours} onChange={(e) => setBudH(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("newProject.hourlyRate")}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input type="number" min="0" step="0.01" value={hourlyRate} onChange={(e) => setRate(e.target.value)} placeholder="0" className="w-full rounded-lg border border-slate-200 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("newProject.startDate")}</label>
            <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("newProject.endDate")}</label>
            <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">{t("common:actions.cancel")}</button>
          <button type="submit" disabled={isPending} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {isPending ? t("common:status.creating") : t("newProject.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onDelete,
}: {
  project: ProjectWithPnL;
  onDelete: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("projects");
  const locale = intlLocale(i18n.language);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, start] = useTransition();
  const c = COLOR_CLASSES[project.color as ProjectColor] ?? COLOR_CLASSES.indigo;

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    start(async () => {
      await deleteProject(project.id);
      onDelete(project.id);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${c.dot}`} />
          <div className="flex-1 min-w-0">
            <Link href={`/projects/${project.id}`} className="text-sm font-semibold text-slate-800 hover:text-indigo-700 truncate block transition-colors">
              {project.name}
            </Link>
            {project.clients && (
              <p className="text-xs text-slate-400 truncate mt-0.5">{clientName(project.clients)}</p>
            )}
          </div>
        </div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${c.bg} ${c.text}`}>
          {t(`status.${project.status}`)}
        </span>
      </div>

      {project.description && (
        <p className="text-xs text-slate-500 line-clamp-2 mb-3">{project.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
        {project.budget_hours && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {t("card.budgetHours", { hours: project.budget_hours })}
          </span>
        )}
        {project.hourly_rate && (
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            {t("card.rate", { rate: project.hourly_rate })}
          </span>
        )}
        {project.end_date && (
          <span>
            {t("card.due", {
              date: new Date(project.end_date + "T00:00:00").toLocaleDateString(locale, { month: "short", day: "numeric" }),
            })}
          </span>
        )}
      </div>

      {/* Profitability (Week 28) */}
      {(project.pnl.revenue > 0 || project.pnl.profit !== 0) && (
        <div className="flex items-center justify-between mb-3 pt-2 border-t border-slate-50">
          <span className="text-xs text-slate-500">
            {project.pnl.revenue > 0 ? t("card.profit") : t("card.costSoFar")}
          </span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${project.pnl.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {money(project.pnl.profit, locale)}
            </span>
            {project.pnl.margin !== null && (
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                project.pnl.profit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
              }`}>
                {(project.pnl.margin * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link
          href={`/projects/${project.id}`}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
        >
          {t("card.view")} <ChevronRight className="w-3 h-3" />
        </Link>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
            confirmDelete
              ? "bg-rose-100 text-rose-700 hover:bg-rose-200"
              : "text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"
          }`}
        >
          {confirmDelete ? t("card.confirmDelete") : t("common:actions.delete")}
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props {
  initialProjects: ProjectWithPnL[];
  clients: { id: string; first_name: string | null; last_name: string | null; company: string | null }[];
}

export function ProjectsClient({ initialProjects, clients }: Props) {
  const { t, i18n } = useTranslation("projects");
  const locale = intlLocale(i18n.language);
  const [projects, setProjects] = useState<ProjectWithPnL[]>(initialProjects);
  const [showNew, setShowNew]   = useState(false);
  const [filter, setFilter]     = useState<string>("active");

  const filtered = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  const activeCount    = projects.filter((p) => p.status === "active").length;
  const completedCount = projects.filter((p) => p.status === "completed").length;

  // Portfolio P&L across the currently shown projects (Week 28)
  const totalRevenue  = filtered.reduce((s, p) => s + p.pnl.revenue, 0);
  const totalProfit   = filtered.reduce((s, p) => s + p.pnl.profit, 0);
  const blendedMargin = totalRevenue > 0 ? totalProfit / totalRevenue : null;
  const hasPnL        = filtered.some((p) => p.pnl.revenue > 0 || p.pnl.profit !== 0);

  const statusLabel = filter === "all" ? "" : t(`status.${filter}`);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("list.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("list.subtitle", { active: activeCount, completed: completedCount })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/projects/templates"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-700 transition-colors"
          >
            <LayoutTemplate className="w-4 h-4" />
            {t("list.templatesLink")}
          </Link>
          <Link
            href="/projects/recurring"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-700 transition-colors"
          >
            <Repeat className="w-4 h-4" />
            {t("list.recurringLink")}
          </Link>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("list.new")}
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === s ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {s === "all" ? t("list.filterAll") : t(`status.${s}`)}
          </button>
        ))}
      </div>

      {/* Portfolio profitability summary (Week 28) */}
      {hasPnL && (
        <div className="flex flex-wrap items-center gap-6 mb-6 bg-white border border-slate-200 rounded-xl px-5 py-4">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{t("list.revenue")}</p>
            <p className="text-lg font-semibold text-slate-800">{money(totalRevenue, locale)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{t("list.profit")}</p>
            <p className={`text-lg font-semibold ${totalProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {money(totalProfit, locale)}
            </p>
          </div>
          {blendedMargin !== null && (
            <div>
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{t("list.blendedMargin")}</p>
              <p className={`text-lg font-semibold ${totalProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {(blendedMargin * 100).toFixed(0)}%
              </p>
            </div>
          )}
          <p className="text-xs text-slate-400 ml-auto">
            {filter === "all"
              ? t("list.acrossAll", { count: filtered.length })
              : t("list.acrossFiltered", { count: filtered.length, status: statusLabel })}
          </p>
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
          <Folder className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500 mb-1">
            {filter === "all" ? t("list.emptyAll") : t("list.emptyFiltered", { status: statusLabel })}
          </p>
          <p className="text-xs text-slate-400 mb-4">
            {t("list.emptyHint")}
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("list.createFirst")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onDelete={(id) => setProjects((prev) => prev.filter((p) => p.id !== id))}
            />
          ))}
        </div>
      )}

      {showNew && (
        <NewProjectModal
          clients={clients}
          onClose={() => setShowNew(false)}
          onCreated={(p) => {
            setProjects((prev) => [p, ...prev]);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}
