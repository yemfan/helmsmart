"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { UsageMeter } from "@/components/dashboard/UsageMeter";
import { ReferAFriendCard } from "@/components/referrals/ReferAFriendCard";
import BriefingsCard from "@/components/dashboard/BriefingsCard";

type Stats = { totalLeads: number; hotLeads: number; messagesSent: number; inactiveLeads: number };
type TaskItem = { id: string; title: string; status: string; priority: string; due_at: string | null; lead_name: string | null };
type EventItem = { id: string; title: string; lead_name: string | null; starts_at: string };
type DigestMetrics = { leads_contacted: number; sms_sent: number; emails_sent: number; calls_logged: number; tasks_completed: number; appointments_booked: number };
type DigestInsight = { key: string; label: string; message: string; tone: string };

export default function OverviewClient({ greetingName, planType }: { greetingName: string; planType: string }) {
  const { t, i18n } = useTranslation("dashboard");
  // Task rows below bind `t` in their .map(), so translation calls inside them
  // have to reach the translator under a name the loop cannot shadow.
  const tr = t;
  const locale = intlLocale(i18n.language);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [digest, setDigest] = useState<{ title: string; metrics: DigestMetrics; insights: DigestInsight[] } | null>(null);
  const [unread, setUnread] = useState(0);

  const loadData = useCallback(async () => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

    const [summaryRes, tasksRes, eventsRes, inboxRes] = await Promise.all([
      fetch("/api/dashboard/summary").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/tasks?status=open").then((r) => r.json()).catch(() => ({})),
      fetch(`/api/dashboard/calendar/events?from=${todayStart}&to=${todayEnd}`).then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/inbox").then((r) => r.json()).catch(() => ({})),
    ]);

    if (summaryRes.ok !== false) {
      // `/api/dashboard/summary` nests these under `metrics` (and names the
      // inactive count `inactive7Days`). Reading them off the top level left
      // every stat card stuck at 0 while Plan Usage / the briefing — which
      // read the correct shape — showed real numbers.
      const m = summaryRes.metrics ?? {};
      setStats({
        totalLeads: m.totalLeads ?? 0,
        hotLeads: m.hotLeads ?? 0,
        messagesSent: m.messagesSent ?? 0,
        inactiveLeads: m.inactive7Days ?? 0,
      });
    }

    setTasks(((tasksRes.tasks ?? []) as any[]).slice(0, 5).map((t: any) => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority, due_at: t.due_at, lead_name: t.lead_name ?? null,
    })));

    setEvents(((eventsRes.events ?? []) as any[]).slice(0, 5).map((e: any) => ({
      id: e.id, title: e.title, lead_name: e.lead_name ?? null, starts_at: e.starts_at,
    })));

    const threads = (inboxRes.threads ?? []) as any[];
    setUnread(threads.filter((t: any) => t.lastDirection === "inbound").length);

    // Load weekly digest
    try {
      const dRes = await fetch("/api/dashboard/summary").then((r) => r.json()).catch(() => null);
      // Digest comes from the overview server component, but we'll show what we have
    } catch { /* */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Time-of-day greeting + date depend on the viewer's local clock, so they
  // must be computed on the client only. Rendering them during SSR caused a
  // hydration mismatch (#418) whenever the server clock/timezone produced a
  // different string than the browser. Seed with a clock-independent default
  // so SSR and the first client render agree, then fill in after mount.
  const [clock, setClock] = useState<{ greeting: string; dateLabel: string }>({
    greeting: t("pages.overview.welcomeBack"),
    dateLabel: "",
  });
  useEffect(() => {
    const d = new Date();
    const h = d.getHours();
    setClock({
      greeting:
        h < 12
          ? t("pages.overview.goodMorning")
          : h < 17
            ? t("pages.overview.goodAfternoon")
            : t("pages.overview.goodEvening"),
      dateLabel: d.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" }),
    });
  }, [t, locale]);

  const overdueTasks = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now());
  const urgentTasks = tasks.filter((t) => t.priority === "urgent" || t.priority === "high");

  return (
    <div className="space-y-4">
      {/* Greeting + Quick Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{clock.greeting}{greetingName ? `, ${greetingName}` : ""}</h1>
          <p className="text-sm text-gray-500">{clock.dateLabel}</p>
        </div>
      </div>

      {/* Priority Alerts */}
      {(overdueTasks.length > 0 || unread > 0) && (
        <div className="flex flex-wrap gap-2">
          {overdueTasks.length > 0 && (
            <Link href="/dashboard/tasks" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100">
              {overdueTasks.length} {t("pages.dashFragments.overdueTask")}{overdueTasks.length > 1 ? "s" : ""}
            </Link>
          )}
          {unread > 0 && (
            <Link href="/dashboard/inbox" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100">
              {unread} {t("pages.dashFragments.unreadMessage")}{unread > 1 ? "s" : ""}
            </Link>
          )}
          {urgentTasks.length > 0 && (
            <Link href="/dashboard/tasks" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100">
              {urgentTasks.length} {t("pages.dashFragments.urgentTask")}{urgentTasks.length > 1 ? "s" : ""}
            </Link>
          )}
        </div>
      )}

      {/* Daily Briefings — morning plan + evening summary, side-by-side. */}
      <BriefingsCard />

      {/* KPI Cards */}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/dashboard/leads" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:bg-gray-50 transition">
            <p className="text-xs text-gray-500">{t("pages.overview.totalLeads")}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalLeads}</p>
          </Link>
          <Link href="/dashboard/leads?filter=hot" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:bg-gray-50 transition">
            <p className="text-xs text-gray-500">{t("pages.overview.hotLeads")}</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{stats.hotLeads}</p>
          </Link>
          <Link href="/dashboard/inbox" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:bg-gray-50 transition">
            <p className="text-xs text-gray-500">{t("pages.overview.messagesSent")}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.messagesSent}</p>
          </Link>
          <Link href="/dashboard/leads?filter=inactive" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:bg-gray-50 transition">
            <p className="text-xs text-gray-500">{t("pages.overview.quietLeads")}</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{stats.inactiveLeads}</p>
            <p className="text-[10px] text-gray-400">7+ days inactive</p>
          </Link>
        </div>
      )}

      {/* Two-column: Today's Schedule + Tasks */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Today's Appointments */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">{t("pages.overview.todaysSchedule")}</h2>
            <Link href="/dashboard/calendar" className="text-xs font-medium text-blue-600 hover:text-blue-800">{t("pages.overview.viewCalendar")}</Link>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t("pages.overview.noAppointments")}</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{e.title}</p>
                    {e.lead_name && <p className="text-xs text-gray-500">{e.lead_name}</p>}
                  </div>
                  <span className="text-xs font-medium text-blue-600">{new Date(e.starts_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open Tasks */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">{t("pages.overview.openTasks")}</h2>
            <Link href="/dashboard/tasks" className="text-xs font-medium text-blue-600 hover:text-blue-800">{t("pages.overview.viewAll")}</Link>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t("pages.overview.noTasks")}</p>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.title}</p>
                    <p className="text-xs text-gray-500">
                      {t.lead_name && <span>{t.lead_name} &middot; </span>}
                      {t.due_at ? (
                        <span className={new Date(t.due_at).getTime() < Date.now() ? "text-red-600" : ""}>
                          {new Date(t.due_at).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                        </span>
                      ) : tr("pages.overview.noDueDate")}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${t.priority === "urgent" ? "bg-red-100 text-red-700" : t.priority === "high" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {t.priority}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">{t("pages.overview.quickActions")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link href="/dashboard/leads/add" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 transition">{t("pages.overview.addContact")}</Link>
          <Link href="/dashboard/contacts/scan" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 transition">{t("pages.overview.scanCard")}</Link>
          <Link href="/dashboard/open-houses/flyer" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 transition">{t("pages.overview.createFlyer")}</Link>
          <Link href="/dashboard/seller-presentation" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 transition">{t("pages.overview.sellerPresentation")}</Link>
        </div>
      </div>

      {/* Plan Usage */}
      <UsageMeter />

      {/* "Like it?" referral CTA */}
      <ReferAFriendCard />
    </div>
  );
}
