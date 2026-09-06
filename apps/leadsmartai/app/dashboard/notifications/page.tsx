import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ListTodo, PhoneCall } from "lucide-react";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getMobileReminders } from "@/lib/mobile/remindersMobile";
import { listAgentInboxNotifications } from "@/lib/notifications/agentNotifications";
import { NotificationsFeed } from "@/components/dashboard/NotificationsFeed";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("dashboard");
  const title = t("pages.dashboardTitles.notifications", { ns: "dashboard" });
  return {
    title,
    description: "View alerts for new leads, tasks, and activity.",
    robots: { index: false },
  };
}

/**
 * Notifications — one feed with a read state, plus a "needs you today" rail.
 *
 * The previous page showed three columns (hot leads, missed calls, reminders)
 * assembled from three other tables and never touched `agent_inbox_notifications`,
 * the table the bell counts. So the bell said 434 unread, the page offered
 * nothing to read or clear, and the two could never agree (2026-09 UX audit).
 */
export default async function NotificationsPage() {
  const serverT = await getServerT("dashboard");
  const locale = intlLocale(await getServerLocale());
  const tr = (key: string, o?: Record<string, unknown>) => serverT(key, { ns: "dashboard", ...o });
  const ctx = await getCurrentAgentContext();

  const [notifications, reminders] = await Promise.all([
    listAgentInboxNotifications(ctx.agentId, 100).catch((err) => {
      console.error("listAgentInboxNotifications failed:", err);
      return [];
    }),
    getMobileReminders(ctx.agentId).catch((err) => {
      console.error("getMobileReminders failed:", err);
      return { upcoming_appointments: [], overdue_tasks: [], follow_ups: [] } as Awaited<ReturnType<typeof getMobileReminders>>;
    }),
  ]);

  const { upcoming_appointments: appointments, overdue_tasks: overdueTasks, follow_ups: followUps } = reminders;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ui-page-title text-brand-text">{tr("notifications.title")}</h1>
        <p className="ui-page-subtitle mt-1 text-brand-text/80">{tr("notifications.feed.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NotificationsFeed initial={notifications} />
        </div>

        {/* Needs you today — the reminder counts, each a link to where the work is. */}
        <aside className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">{tr("notifications.feed.needsYou")}</h2>
          <ul className="space-y-2">
            <li>
              <Link href="/dashboard/tasks" className="flex items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-3 py-3 text-sm shadow-sm hover:bg-slate-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                  <ListTodo className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">{tr("notifications.overdueTasks")}</span>
                  <span className="block text-xs text-slate-500">
                    {overdueTasks.length > 0 ? overdueTasks.slice(0, 2).map((t) => t.title).join(" · ") : tr("notifications.feed.none")}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-slate-700">{overdueTasks.length}</span>
              </Link>
            </li>
            <li>
              <Link href="/dashboard/contacts" className="flex items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-3 py-3 text-sm shadow-sm hover:bg-slate-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-800">
                  <PhoneCall className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">{tr("notifications.followUps")}</span>
                  <span className="block text-xs text-slate-500">
                    {followUps.length > 0
                      ? followUps.slice(0, 2).map((f) => f.lead_name ?? tr("pages.notifications.lead")).join(" · ")
                      : tr("notifications.feed.none")}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-slate-700">{followUps.length}</span>
              </Link>
            </li>
            <li>
              <Link href="/dashboard/calendar" className="flex items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-3 py-3 text-sm shadow-sm hover:bg-slate-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <CalendarDays className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">{tr("pages.notifications.appointments")}</span>
                  <span className="block text-xs text-slate-500">
                    {appointments.length > 0 && appointments[0].starts_at
                      ? `${appointments[0].title} · ${new Date(appointments[0].starts_at).toLocaleString(locale, { weekday: "short", hour: "numeric", minute: "2-digit" })}`
                      : tr("notifications.feed.none")}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-slate-700">{appointments.length}</span>
              </Link>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
