import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";
import { getProject, type ProjectStatus } from "@/lib/actions/projects";
import { listProjectExpenses } from "@/lib/actions/expenses";
import {
  ArrowLeft, Clock, DollarSign, CheckSquare, TrendingUp, CalendarDays,
} from "lucide-react";
import { ProjectStatusToggle } from "./project-status-toggle";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("projects");
  return { title: t("meta.project") };
}

const COLOR_DOTS: Record<string, string> = {
  indigo: "bg-indigo-500", emerald: "bg-emerald-500", rose: "bg-rose-500",
  amber: "bg-amber-500",  violet: "bg-violet-500",  slate: "bg-slate-400",
};

const STATUS_BADGES: Record<string, string> = {
  active:    "bg-emerald-100 text-emerald-700",
  paused:    "bg-amber-100 text-amber-700",
  completed: "bg-indigo-100 text-indigo-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();
  const [t, uiLocale] = await Promise.all([getServerT("projects"), getServerLocale()]);
  const locale = intlLocale(uiLocale);

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(n);
  const fmtHrs = (mins: number) => {
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0
      ? t("detail.durationHoursMinutes", { hours: h, minutes: m })
      : t("detail.durationMinutes", { minutes: m });
  };
  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });

  const result = await getProject(id);
  if (!result) notFound();

  const { project, stats } = result;

  // Load time entries for this project
  const { data: entries } = await supabase
    .from("time_entries")
    .select("id, description, started_at, duration_minutes, billable, hourly_rate, invoiced, clients(first_name, last_name, company)")
    .eq("organization_id", orgId)
    .eq("project_id", id)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(50);

  // Load tasks for this project
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, completed")
    .eq("organization_id", orgId)
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Load expenses tagged to this project (Week 27 — project P&L)
  const projectExpenses = await listProjectExpenses(id);

  const clientName = project.clients
    ? [project.clients.first_name, project.clients.last_name].filter(Boolean).join(" ") || project.clients.company || t("timesheets.clientFallback")
    : null;

  const budgetProgress = project.budget_hours && stats.totalMinutes
    ? Math.min(100, (stats.totalMinutes / 60 / project.budget_hours) * 100)
    : null;

  const budgetBurnAmt = project.budget_amount && stats.billableAmount
    ? Math.min(100, (stats.billableAmount / project.budget_amount) * 100)
    : null;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Back */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/projects" className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${COLOR_DOTS[project.color] ?? "bg-indigo-500"}`} />
          <h1 className="text-xl font-semibold text-slate-900">{project.name}</h1>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGES[project.status] ?? STATUS_BADGES.active}`}>
            {t(`status.${project.status}`)}
          </span>
        </div>
        <ProjectStatusToggle projectId={id} currentStatus={project.status as ProjectStatus} />
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mb-8">
        {clientName && (
          <span>{t("detail.client")} <span className="text-slate-700 font-medium">{clientName}</span></span>
        )}
        {project.start_date && (
          <span className="flex items-center gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            {new Date(project.start_date + "T00:00:00").toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}
            {project.end_date && (
              <> → {new Date(project.end_date + "T00:00:00").toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}</>
            )}
          </span>
        )}
        {project.hourly_rate && (
          <span>{t("detail.rate", { rate: project.hourly_rate })}</span>
        )}
      </div>

      {project.description && (
        <p className="text-sm text-slate-600 mb-8 bg-slate-50 rounded-xl px-5 py-4">
          {project.description}
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          {
            key: "hours",
            label: t("detail.totalHours"),
            value: fmtHrs(stats.totalMinutes),
            sub: t("detail.billableSub", { duration: fmtHrs(stats.billableMinutes) }),
            icon: <Clock className="w-4 h-4 text-indigo-400" />,
          },
          {
            key: "billable",
            label: t("detail.billableAmount"),
            value: fmt(stats.billableAmount),
            sub: t("detail.invoicedSub", { amount: fmt(stats.invoicedAmount) }),
            icon: <DollarSign className="w-4 h-4 text-emerald-400" />,
          },
          {
            key: "tasks",
            label: t("detail.tasks"),
            value: t("detail.openTasks", { count: stats.openTasks }),
            sub: t("detail.completedTasks", { count: stats.completedTasks }),
            icon: <CheckSquare className="w-4 h-4 text-amber-400" />,
          },
          {
            key: "budget",
            label: t("detail.budgetUsed"),
            value: project.budget_hours
              ? `${((stats.totalMinutes / 60)).toFixed(1)} / ${project.budget_hours}h`
              : project.budget_amount
              ? `${fmt(stats.billableAmount)} / ${fmt(project.budget_amount)}`
              : t("detail.noBudget"),
            sub: budgetProgress !== null ? `${budgetProgress.toFixed(0)}%` : "",
            icon: <TrendingUp className="w-4 h-4 text-violet-400" />,
          },
        ].map(({ key, label, value, sub, icon }) => (
          <div key={key} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
              {icon}
            </div>
            <p className="text-lg font-semibold text-slate-800">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Budget progress bars */}
      {(budgetProgress !== null || budgetBurnAmt !== null) && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-8 space-y-3">
          {budgetProgress !== null && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-500 font-medium">{t("detail.hoursBudget")}</span>
                <span className={`font-semibold ${budgetProgress > 90 ? "text-rose-600" : budgetProgress > 75 ? "text-amber-600" : "text-slate-700"}`}>
                  {budgetProgress.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetProgress > 90 ? "bg-rose-500" : budgetProgress > 75 ? "bg-amber-500" : "bg-indigo-500"}`}
                  style={{ width: `${budgetProgress}%` }}
                />
              </div>
            </div>
          )}
          {budgetBurnAmt !== null && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-500 font-medium">{t("detail.amountBudget")}</span>
                <span className={`font-semibold ${budgetBurnAmt > 90 ? "text-rose-600" : budgetBurnAmt > 75 ? "text-amber-600" : "text-slate-700"}`}>
                  {budgetBurnAmt.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${budgetBurnAmt > 90 ? "bg-rose-500" : budgetBurnAmt > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${budgetBurnAmt}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Profitability / P&L (Week 27) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">{t("detail.profitability")}</h2>
          {stats.margin !== null && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              stats.profit >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}>
              {t("detail.marginBadge", { percent: (stats.margin * 100).toFixed(0) })}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("detail.revenue")}</p>
            <p className="text-lg font-semibold text-slate-800 mt-1">{fmt(stats.revenue)}</p>
            {stats.billableAmount > stats.invoicedAmount && (
              <p className="text-xs text-amber-600 mt-0.5">
                {t("detail.unbilled", { amount: fmt(stats.billableAmount - stats.invoicedAmount) })}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("detail.laborCost")}</p>
            <p className="text-lg font-semibold text-slate-600 mt-1">−{fmt(stats.laborCost)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("detail.expenses")}</p>
            <p className="text-lg font-semibold text-slate-600 mt-1">−{fmt(stats.expensesTotal)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{t("detail.profit")}</p>
            <p className={`text-lg font-semibold mt-1 ${stats.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {fmt(stats.profit)}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          {t("detail.pnlNote")}
          {stats.laborCost === 0 && (
            <>
              {" "}
              <Link href="/settings" className="text-indigo-600 hover:underline">{t("detail.laborHint")}</Link>
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Time entries */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">{t("detail.timeEntries")}</h2>
            <Link href={`/timesheets`} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              {t("detail.viewAll")}
            </Link>
          </div>
          {!entries?.length ? (
            <div className="flex flex-col items-center py-10 text-center px-6">
              <Clock className="w-7 h-7 text-slate-300 mb-2" />
              <p className="text-xs text-slate-400">{t("detail.noTimeEntries")}</p>
              <p className="text-xs text-slate-400 mt-1">{t("detail.noTimeEntriesHint")}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {entries.slice(0, 10).map((e) => {
                const amt = e.billable && e.hourly_rate && e.duration_minutes
                  ? (e.duration_minutes / 60) * Number(e.hourly_rate)
                  : null;
                return (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${e.billable ? "bg-emerald-400" : "bg-slate-300"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{e.description || t("detail.noDescription")}</p>
                      <p className="text-xs text-slate-400">
                        {fmtDay(e.started_at)}
                      </p>
                    </div>
                    {amt !== null && (
                      <span className="text-xs text-emerald-600 font-medium flex-shrink-0">{fmt(amt)}</span>
                    )}
                    <span className="text-xs font-mono text-slate-500 flex-shrink-0">
                      {fmtHrs(e.duration_minutes ?? 0)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">{t("detail.tasks")}</h2>
            <Link href="/tasks" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              {t("detail.viewAll")}
            </Link>
          </div>
          {!tasks?.length ? (
            <div className="flex flex-col items-center py-10 text-center px-6">
              <CheckSquare className="w-7 h-7 text-slate-300 mb-2" />
              <p className="text-xs text-slate-400">{t("detail.noTasks")}</p>
              <p className="text-xs text-slate-400 mt-1">{t("detail.noTasksHint")}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {tasks.slice(0, 10).map((task) => (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`w-4 h-4 rounded border-2 flex-shrink-0 ${task.completed ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${task.completed ? "line-through text-slate-400" : "text-slate-700"}`}>{task.title}</p>
                    {task.due_date && (
                      <p className="text-xs text-slate-400">
                        {t("detail.taskDue", {
                          date: new Date(task.due_date + "T00:00:00").toLocaleDateString(locale, { month: "short", day: "numeric" }),
                        })}
                      </p>
                    )}
                  </div>
                  {task.priority && task.priority !== "normal" && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      task.priority === "urgent" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {t(`priority.${task.priority}`)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Project expenses (Week 27) */}
      <div className="bg-white rounded-xl border border-slate-200 mt-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">{t("detail.expenses")}</h2>
          <Link href="/books/expenses/new" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
            {t("detail.addExpense")}
          </Link>
        </div>
        {!projectExpenses.length ? (
          <div className="flex flex-col items-center py-10 text-center px-6">
            <DollarSign className="w-7 h-7 text-slate-300 mb-2" />
            <p className="text-xs text-slate-400">{t("detail.noExpenses")}</p>
            <p className="text-xs text-slate-400 mt-1">{t("detail.noExpensesHint")}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {projectExpenses.map((ex) => (
              <div key={ex.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700 truncate">{ex.memo || ex.accountName}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(ex.date + "T00:00:00").toLocaleDateString(locale, { month: "short", day: "numeric" })} · {ex.accountName}
                  </p>
                </div>
                <span className="text-sm font-medium text-slate-700 flex-shrink-0">{fmt(ex.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
