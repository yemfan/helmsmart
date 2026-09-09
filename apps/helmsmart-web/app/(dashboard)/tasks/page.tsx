import { ResponsibleEmployee } from "@/components/responsible-employee";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { AddTaskModal } from "@/components/add-task-modal";
import { TaskRow } from "@/components/task-row";
import { PriorityFilter } from "./priority-filter";
import Link from "next/link";
import { CheckSquare, Filter, Repeat } from "lucide-react";
import { MarkTaskButton } from "@/components/mark-task-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("tasks");
  return { title: t("meta.tasks") };
}

const STATUS_TABS = [
  { value: "",            key: "open" },
  { value: "in_progress", key: "inProgress" },
  { value: "done",        key: "done" },
] as const;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = params.status ?? "";
  const priorityFilter = params.priority ?? "";

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();
  const t = await getServerT("tasks");

  const [tasksRes, clientsRes] = await Promise.all([
    (() => {
      let q = supabase
        .from("tasks")
        .select(
          "id, title, notes, due_date, status, priority, clients(id, first_name, last_name, company)"
        )
        .eq("organization_id", orgId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (statusFilter === "done") {
        q = q.in("status", ["done", "cancelled"]);
      } else if (statusFilter === "in_progress") {
        q = q.eq("status", "in_progress");
      } else {
        q = q.eq("status", "open");
      }

      if (priorityFilter) q = q.eq("priority", priorityFilter);

      return q.limit(200);
    })(),
    supabase
      .from("clients")
      .select("id, first_name, last_name, company")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
  ]);

  const tasks = tasksRes.data ?? [];
  const clients = clientsRes.data ?? [];

  // Overdue count (for badge)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueCount = tasks.filter(
    (t) =>
      t.due_date &&
      new Date(t.due_date + "T00:00:00") < today &&
      t.status === "open"
  ).length;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <ResponsibleEmployee slug="mark" className="mb-3" />
          <h1 className="text-2xl font-semibold text-slate-900">{t("list.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("list.count", { count: tasks.length })}
            {overdueCount > 0 && (
              <span className="text-rose-600 ml-1">{t("list.overdue", { count: overdueCount })}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MarkTaskButton />
          <Link
            href="/tasks/recurring"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-700 transition-colors"
          >
            <Repeat className="w-4 h-4" />
            {t("list.recurringLink")}
          </Link>
          <AddTaskModal
            clients={clients as {
              id: string;
              first_name: string | null;
              last_name: string | null;
              company: string | null;
            }[]}
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {STATUS_TABS.map(({ value, key }) => (
            <a
              key={value}
              href={
                value
                  ? `/tasks?status=${value}${priorityFilter ? `&priority=${priorityFilter}` : ""}`
                  : `/tasks${priorityFilter ? `?priority=${priorityFilter}` : ""}`
              }
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t(`list.tabs.${key}`)}
            </a>
          ))}
        </div>

        {/* Priority filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <PriorityFilter statusFilter={statusFilter} priorityFilter={priorityFilter} />
        </div>
      </div>

      {/* Task list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {!tasks.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
              <CheckSquare className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">
              {statusFilter === "done"
                ? t("list.empty.done")
                : statusFilter === "in_progress"
                ? t("list.empty.inProgress")
                : t("list.empty.open")}
            </p>
            {!statusFilter && (
              <p className="text-xs text-slate-400 max-w-xs mb-5">
                {t("list.empty.hint")}
              </p>
            )}
            {!statusFilter && (
              <AddTaskModal
                clients={clients as {
                  id: string;
                  first_name: string | null;
                  last_name: string | null;
                  company: string | null;
                }[]}
              />
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task as Parameters<typeof TaskRow>[0]["task"]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
