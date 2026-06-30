"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UsageMeter } from "@/components/dashboard/UsageMeter";
import { ReferAFriendCard } from "@/components/referrals/ReferAFriendCard";
import BriefingsCard from "@/components/dashboard/BriefingsCard";

type Stats = { totalLeads: number; hotLeads: number; messagesSent: number; inactiveLeads: number };
type TaskItem = { id: string; title: string; status: string; priority: string; due_at: string | null; lead_name: string | null };
type EventItem = { id: string; title: string; lead_name: string | null; starts_at: string };
type DigestMetrics = { leads_contacted: number; sms_sent: number; emails_sent: number; calls_logged: number; tasks_completed: number; appointments_booked: number };
type DigestInsight = { key: string; label: string; message: string; tone: string };

export default function OverviewClient({ greetingName, planType }: { greetingName: string; planType: string }) {
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
      setStats({
        totalLeads: summaryRes.totalLeads ?? 0,
        hotLeads: summaryRes.hotLeads ?? 0,
        messagesSent: summaryRes.messagesSent ?? 0,
        inactiveLeads: summaryRes.inactiveLeads ?? 0,
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
    greeting: "Welcome back",
    dateLabel: "",
  });
  useEffect(() => {
    const d = new Date();
    const h = d.getHours();
    setClock({
      greeting: h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening",
      dateLabel: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    });
  }, []);

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
              {overdueTasks.length} overdue task{overdueTasks.length > 1 ? "s" : ""}
            </Link>
          )}
          {unread > 0 && (
            <Link href="/dashboard/inbox" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100">
              {unread} unread message{unread > 1 ? "s" : ""}
            </Link>
          )}
          {urgentTasks.length > 0 && (
            <Link href="/dashboard/tasks" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100">
              {urgentTasks.length} urgent task{urgentTasks.length > 1 ? "s" : ""}
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
            <p className="text-xs text-gray-500">Total Leads</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalLeads}</p>
          </Link>
          <Link href="/dashboard/leads?filter=hot" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:bg-gray-50 transition">
            <p className="text-xs text-gray-500">Hot Leads</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{stats.hotLeads}</p>
          </Link>
          <Link href="/dashboard/inbox" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:bg-gray-50 transition">
            <p className="text-xs text-gray-500">Messages Sent</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.messagesSent}</p>
          </Link>
          <Link href="/dashboard/leads?filter=inactive" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:bg-gray-50 transition">
            <p className="text-xs text-gray-500">Quiet Leads</p>
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
            <h2 className="text-sm font-semibold text-gray-900">Today&apos;s Schedule</h2>
            <Link href="/dashboard/calendar" className="text-xs font-medium text-blue-600 hover:text-blue-800">View calendar</Link>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No appointments today.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{e.title}</p>
                    {e.lead_name && <p className="text-xs text-gray-500">{e.lead_name}</p>}
                  </div>
                  <span className="text-xs font-medium text-blue-600">{new Date(e.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open Tasks */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Open Tasks</h2>
            <Link href="/dashboard/tasks" className="text-xs font-medium text-blue-600 hover:text-blue-800">View all</Link>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No open tasks.</p>
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
                          {new Date(t.due_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      ) : "No due date"}
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
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link href="/dashboard/leads/add" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 transition">
            Add Contact
          </Link>
          <Link href="/dashboard/contacts/scan" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 transition">
            Scan Card
          </Link>
          <Link href="/dashboard/open-houses/flyer" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 transition">
            Create Flyer
          </Link>
          <Link href="/dashboard/seller-presentation" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100 transition">
            Seller Presentation
          </Link>
        </div>
      </div>

      {/* Plan Usage */}
      <UsageMeter />

      {/* "Like it?" referral CTA */}
      <ReferAFriendCard />
    </div>
  );
}
