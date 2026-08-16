import Link from "next/link";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Flame, PhoneMissed } from "lucide-react";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentAgentContext, getLeads } from "@/lib/dashboardService";
import { getMobileReminders } from "@/lib/mobile/remindersMobile";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
  description: "View alerts for new leads, tasks, and activity.",
  keywords: ["notifications", "alerts", "activity feed"],
  robots: { index: false },
};

type LeadLite = {
  id: string;
  name: string | null;
  email: string | null;
};

type NotificationRow = {
  id: string;
  contact_id: string | null;
  property_id: string | null;
  type: string;
  message: string;
  sent_at: string;
};

type HotLeadRow = { id: string; name: string | null; last_activity_at: string | null };
type MissedCallRow = {
  id: string;
  contact_id: string | null;
  status: string | null;
  created_at: string;
  summary: string | null;
  from_phone: string | null;
  /** PostgREST may return one object or a single-element array for FK embeds */
  leads: { name: string | null } | { name: string | null }[] | null;
};

function leadEmbedName(embed: MissedCallRow["leads"]): string | null {
  if (embed == null) return null;
  if (Array.isArray(embed)) return embed[0]?.name ?? null;
  return embed.name ?? null;
}

/** Raw missed-call row from `call_logs` (the same source the Receptionist
 *  console and Boss recommendations read — the phone flows write missed calls
 *  there, not to `lead_calls`, which is why this panel used to read empty). */
type CallLogMissedRow = {
  id: string;
  contact_id: string | null;
  status: string | null;
  from_phone: string | null;
  notes: string | null;
  created_at: string;
};

/** Strip the bookkeeping prefix the voice flow writes into `notes`. */
function cleanCallNote(notes: string | null): string | null {
  const n = (notes ?? "").trim();
  if (!n) return null;
  if (n.startsWith("AI call summary:")) return n.slice("AI call summary:".length).trim();
  return n;
}

function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type FollowUpReminderRow = {
  contact_id: string;
  lead_name: string | null;
  next_contact_at: string;
  overdue: boolean;
};

/** Second line under “Follow-up Reminder” — e.g. “Call Mike Chen today”. */
function followUpActionSubtitle(
  f: FollowUpReminderRow,
  tr: (k: string, o?: Record<string, unknown>) => string,
  locale: string,
): string {
  const name = f.lead_name?.trim() || "this contact";
  const when = new Date(f.next_contact_at);
  const now = new Date();
  if (f.overdue) {
    return `Follow up with ${name} — overdue`;
  }
  if (isSameLocalCalendarDay(when, now)) {
    return tr("notifications.callToday", { name });
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameLocalCalendarDay(when, tomorrow)) {
    return tr("notifications.callTomorrow", { name });
  }
  return tr("notifications.contactOn", {
    name,
    when: when.toLocaleString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  });
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

export default async function NotificationsPage() {
  const { t } = useTranslation("dashboard");
  const serverT = await getServerT();
  const locale = intlLocale(await getServerLocale());
  // Named `tr` — task and follow-up rows below bind `t` in their .map().
  const tr = (key: string, o?: Record<string, unknown>) => serverT(key, { ns: "dashboard", ...o });
  const ctx = await getCurrentAgentContext();
  const agentId = ctx.agentId;

  const leads = await getLeads({ limit: 500 });
  const leadIds = leads.map((l) => l.id);
  const leadMap = new Map<string, LeadLite>();
  leads.forEach((l) => leadMap.set(l.id, { id: l.id, name: l.name, email: l.email }));

  const [
    hotRes,
    missedRes,
    reminders,
    notificationsRes,
  ] = await Promise.all([
    supabaseServer
      .from("contacts")
      .select("id,name,last_activity_at")
      .eq("agent_id", agentId)
      .eq("rating", "hot")
      .order("last_activity_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("call_logs")
      .select("id,contact_id,status,from_phone,notes,created_at,direction")
      .eq("agent_id", agentId)
      .eq("direction", "inbound")
      .in("status", ["missed", "no_answer", "failed", "busy"])
      .order("created_at", { ascending: false })
      .limit(25),
    getMobileReminders(agentId).catch((err) => {
      console.error("getMobileReminders failed:", err);
      return { upcoming_appointments: [], overdue_tasks: [], follow_ups: [] } as Awaited<ReturnType<typeof getMobileReminders>>;
    }),
    supabaseServer
      .from("notifications")
      .select("id,contact_id,property_id,type,message,sent_at")
      .in("contact_id", leadIds.length ? leadIds : ["__none__"])
      .order("sent_at", { ascending: false })
      .limit(50),
  ]);

  const hotLeads = (hotRes.data ?? []) as HotLeadRow[];
  const missedCalls: MissedCallRow[] = ((missedRes.data ?? []) as CallLogMissedRow[]).map((r) => ({
    id: r.id,
    contact_id: r.contact_id,
    status: r.status,
    created_at: r.created_at,
    summary: cleanCallNote(r.notes),
    from_phone: r.from_phone,
    leads: r.contact_id ? { name: leadMap.get(r.contact_id)?.name ?? null } : null,
  }));
  const notifications = (notificationsRes.data ?? []) as NotificationRow[];

  const propertyIds = Array.from(
    new Set(notifications.map((n) => n.property_id).filter(Boolean))
  ) as string[];

  const { data: propertiesData } = await supabaseServer
    .from("properties_warehouse")
    .select("id,address")
    .in("id", propertyIds.length ? propertyIds : ["__none__"]);

  const propertyMap = new Map<string, string>();
  (propertiesData ?? []).forEach((p: { id?: unknown; address?: unknown }) =>
    propertyMap.set(String(p.id), String(p.address ?? ""))
  );

  const { upcoming_appointments: appointments, overdue_tasks: overdueTasks, follow_ups: followUps } =
    reminders;

  const reminderCount =
    appointments.length + overdueTasks.length + followUps.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="ui-page-title text-brand-text">{tr("notifications.title")}</h1>
        <p className="ui-page-subtitle mt-1 text-brand-text/80">
          {tr("notifications.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Hot leads */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-orange-200/80 bg-gradient-to-b from-orange-50/50 to-white shadow-sm ring-1 ring-orange-900/[0.04]">
          <div className="flex items-center gap-2 border-b border-orange-100/90 bg-white/80 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
              <Flame className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{tr("notifications.hotLeads")}</h2>
              <p className="text-xs text-slate-500">{tr("notifications.hotLeadsSub")}</p>
            </div>
            <Link
              href="/dashboard/leads?filter=hot"
              className="ml-auto text-xs font-semibold text-[#0072ce] hover:underline"
            >
              {tr("notifications.viewAll")}
            </Link>
          </div>
          <div className="min-h-[120px] flex-1">
            {hotLeads.length ? (
              <ul className="divide-y divide-orange-100/80">
                {hotLeads.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/dashboard/leads?id=${encodeURIComponent(String(l.id))}`}
                      className="block px-4 py-3 transition hover:bg-orange-50/60"
                    >
                      <p className="text-sm font-medium text-slate-900">{l.name ?? "Lead"}</p>
                      {l.last_activity_at ? (
                        <p className="mt-0.5 text-xs text-slate-500">{t("pages.dashFragments.lastActivity", { ns: "dashboard" })} {new Date(l.last_activity_at).toLocaleString(locale)}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyRow>{tr("notifications.noHotLeads")}</EmptyRow>
            )}
          </div>
        </section>

        {/* Missed calls */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <PhoneMissed className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{tr("notifications.missedCalls")}</h2>
              <p className="text-xs text-slate-500">{tr("notifications.missedCallsSub")}</p>
            </div>
            <Link
              href="/dashboard/calls"
              className="ml-auto text-xs font-semibold text-[#0072ce] hover:underline"
            >
              {tr("notifications.callLog")}
            </Link>
          </div>
          <div className="min-h-[120px] flex-1">
            {missedCalls.length ? (
              <ul className="space-y-2 p-3">
                {missedCalls.map((c, idx) => {
                  const leadName = leadEmbedName(c.leads);
                  const displayName = leadName ?? c.from_phone ?? tr("notifications.unknownCaller");
                  const href =
                    c.contact_id != null
                      ? `/dashboard/leads?id=${encodeURIComponent(String(c.contact_id))}`
                      : "/dashboard/calls";
                  const summary = String(c.summary ?? "").trim();
                  const detailLine = summary
                    ? `${summary.length > 120 ? `${summary.slice(0, 119)}…` : summary} — tap to review`
                    : tr("notifications.aiCaptured");
                  return (
                    <li key={c.id}>
                      <Link
                        href={href}
                        className={[
                          "block rounded-xl border px-3 py-3 text-sm transition",
                          idx === 0
                            ? "border-rose-200/90 bg-gradient-to-br from-rose-50/90 to-white shadow-sm hover:border-rose-300/80"
                            : "border-slate-100 bg-white hover:bg-slate-50/90",
                        ].join(" ")}
                      >
                        <p className="font-semibold leading-snug text-slate-900">
                          <span className="mr-1.5" aria-hidden>
                            📞
                          </span>{t("pages.notifications.missedCall", { ns: "dashboard" })}<span className="font-semibold">{displayName}</span>
                        </p>
                        <p className="mt-1.5 text-sm leading-snug text-slate-600">{detailLine}</p>
                        <p className="mt-2 text-[11px] text-slate-400">
                          {new Date(c.created_at).toLocaleString(locale)}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyRow>{tr("notifications.noMissedCalls")}</EmptyRow>
            )}
          </div>
        </section>

        {/* Reminders */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-800">
              <Bell className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{tr("notifications.reminders")}</h2>
              <p className="text-xs text-slate-500">
                {tr("notifications.remindersSub")}
                {reminderCount > 0 ? ` · ${reminderCount}` : ""}
              </p>
            </div>
            <Link
              href="/dashboard/calendar"
              className="ml-auto text-xs font-semibold text-[#0072ce] hover:underline"
            >
              {tr("notifications.calendar")}
            </Link>
          </div>
          <div className="min-h-[120px] flex-1 space-y-4 p-4">
            {appointments.length > 0 ? (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{t("pages.notifications.appointments", { ns: "dashboard" })}</p>
                <ul className="space-y-2">
                  {appointments.slice(0, 6).map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-slate-900">{ev.title}</p>
                      <p className="text-xs text-slate-600">
                        {ev.lead_name ? `${ev.lead_name} · ` : ""}
                        {ev.starts_at ? new Date(ev.starts_at).toLocaleString(locale) : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {overdueTasks.length > 0 ? (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {tr("notifications.overdueTasks")}
                </p>
                <ul className="space-y-2">
                  {overdueTasks.slice(0, 6).map((t) => (
                    <li key={t.id}>
                      <Link
                        href="/dashboard/tasks"
                        className="block rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm transition hover:bg-amber-50"
                      >
                        <p className="font-medium text-slate-900">{t.title}</p>
                        <p className="text-xs text-amber-800/90">
                          {t.lead_name ? `${t.lead_name} · ` : ""}
                          {t.due_at ? tr("notifications.due", { when: new Date(t.due_at).toLocaleString(locale) }) : "—"}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {followUps.length > 0 ? (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  {tr("notifications.followUps")}
                </p>
                <ul className="space-y-2">
                  {followUps.slice(0, 8).map((f, idx) => (
                    <li key={f.contact_id}>
                      <Link
                        href={`/dashboard/leads?id=${encodeURIComponent(f.contact_id)}`}
                        className={[
                          "block rounded-xl border px-3 py-3 text-sm transition",
                          idx === 0
                            ? "border-sky-200/90 bg-gradient-to-br from-sky-50/90 to-white shadow-sm hover:border-sky-300/80"
                            : "border-slate-100 bg-white hover:bg-slate-50/90",
                        ].join(" ")}
                      >
                        <p className="font-semibold leading-snug text-slate-900">
                          <span className="mr-1.5" aria-hidden>
                            ⏰
                          </span>
                          {tr("notifications.followUpReminder")}
                        </p>
                        <p
                          className={
                            f.overdue
                              ? "mt-1.5 text-sm font-normal leading-snug text-rose-600"
                              : "mt-1.5 text-sm font-normal leading-snug text-slate-600"
                          }
                        >
                          {followUpActionSubtitle(f, tr, locale)}
                        </p>
                        <p className="mt-2 text-[11px] text-slate-400">
                          {tr("notifications.scheduled", { when: new Date(f.next_contact_at).toLocaleString(locale) })}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {reminderCount === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">{t("pages.dashFragments.noUpcoming", { ns: "dashboard" })}{" "}
                <Link href="/dashboard/tasks" className="font-semibold text-[#0072ce] hover:underline">{t("pages.notifications.tasks", { ns: "dashboard" })}</Link>{" "}
                and{" "}
                <Link href="/dashboard/calendar" className="font-semibold text-[#0072ce] hover:underline">
                  calendar
                </Link>{" "}{t("pages.dashFragments.willShowHere", { ns: "dashboard" })}</p>
            ) : null}
          </div>
        </section>
      </div>

      {/* Legacy: automated listing/property alerts */}
      {notifications.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{tr("notifications.listingAlerts")}</h2>
            <p className="text-sm text-slate-600">{t("pages.notifications.nearbyActivity", { ns: "dashboard" })}</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="ui-table-header px-4 py-3 text-left">{tr("notifications.columns.lead")}</th>
                    <th className="ui-table-header px-4 py-3 text-left">{tr("notifications.columns.type")}</th>
                    <th className="ui-table-header px-4 py-3 text-left">{tr("notifications.columns.property")}</th>
                    <th className="ui-table-header px-4 py-3 text-left">{tr("notifications.columns.sent")}</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={n.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="ui-table-cell px-4 py-3">
                        <div className="ui-card-title text-brand-text">
                          {leadMap.get(n.contact_id ?? "")?.name ?? "—"}
                        </div>
                        <div className="ui-meta text-slate-500">{leadMap.get(n.contact_id ?? "")?.email ?? ""}</div>
                      </td>
                      <td className="ui-table-cell px-4 py-3">
                        <span
                          className={
                            n.type === "sold"
                              ? "inline-flex items-center rounded-full border border-green-200 bg-brand-surface px-2 py-0.5 text-xs font-semibold text-brand-success"
                              : "inline-flex items-center rounded-full border border-blue-200 bg-brand-surface px-2 py-0.5 text-xs font-semibold text-brand-primary"
                          }
                        >
                          {n.type}
                        </span>
                      </td>
                      <td className="ui-table-cell px-4 py-3">
                        {n.property_id ? propertyMap.get(n.property_id) ?? n.property_id : "—"}
                      </td>
                      <td className="ui-table-cell whitespace-nowrap px-4 py-3 text-slate-600">
                        {new Date(n.sent_at).toLocaleString(locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
