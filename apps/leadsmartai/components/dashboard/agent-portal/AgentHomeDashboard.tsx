import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Flame,
  MessageSquare,
  Sparkles,
  Sun,
  Zap,
} from "lucide-react";

export type AgentHomeMetric = {
  label: string;
  value: number | string;
  href: string;
  hint?: string;
};

export type AgentAgendaItem = { id: string; time: string; title: string; href?: string };

export type AgentTaskRow = { id: string; title: string; done: boolean; href?: string };

export type AgentHotLead = {
  id: string;
  name: string;
  href: string;
  /** e.g. latest SMS/email snippet or inferred intent */
  subtitle?: string;
};

export type AgentConversation = { id: string; title: string; subtitle: string; at: string; href?: string };

type Props = {
  greetingName: string;
  stats: AgentHomeMetric[];
  agenda: AgentAgendaItem[];
  tasksToday: AgentTaskRow[];
  hotLeads: AgentHotLead[];
  aiAlerts: string[];
  conversations: AgentConversation[];
};

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-900/[0.02] ring-1 ring-slate-900/[0.03] ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  action,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
      </div>
      {action}
    </div>
  );
}

/**
 * RealtyBoss agent portal — Home dashboard (desktop-first, responsive grid).
 */
export function AgentHomeDashboard({
  greetingName,
  stats,
  agenda,
  tasksToday,
  hotLeads,
  aiAlerts,
  conversations,
}: Props) {
  const first = greetingName.trim() || "there";

  return (
    <div className="mx-auto max-w-[1600px] space-y-8 pb-10">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Today</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
          {first}
        </h1>
        <p className="text-sm text-slate-600">Your pipeline at a glance — act on what matters.</p>
      </header>

      {/* Stats */}
      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-[#0072ce]/35 hover:shadow-md"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{s.value}</p>
              {s.hint ? <p className="mt-1 text-xs text-slate-500">{s.hint}</p> : null}
              <p className="mt-3 text-xs font-medium text-[#0072ce] opacity-0 transition group-hover:opacity-100">
                View →
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Daily agenda + Tasks */}
        <div className="space-y-6 lg:col-span-5">
          <Card>
            <SectionTitle
              icon={CalendarDays}
              title="Daily agenda"
              action={
                <Link
                  href="/dashboard/calendar"
                  className="text-xs font-semibold text-[#0072ce] hover:underline"
                >
                  Calendar
                </Link>
              }
            />
            {agenda.length ? (
              <ul className="space-y-2">
                {agenda.map((a) => (
                  <li key={a.id}>
                    {a.href ? (
                      <Link
                        href={a.href}
                        className="flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50"
                      >
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{a.time}</span>
                        <span className="text-sm font-medium text-slate-900">{a.title}</span>
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 rounded-xl px-2 py-2">
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{a.time}</span>
                        <span className="text-sm font-medium text-slate-900">{a.title}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">
                Nothing scheduled yet.{" "}
                <Link href="/dashboard/calendar" className="font-semibold text-[#0072ce] hover:underline">
                  Open calendar
                </Link>
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle
              icon={Sun}
              title="Tasks today"
              action={
                <Link href="/dashboard/tasks" className="text-xs font-semibold text-[#0072ce] hover:underline">
                  All tasks
                </Link>
              }
            />
            {tasksToday.length ? (
              <ul className="space-y-1">
                {tasksToday.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={t.href ?? "/dashboard/tasks"}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm transition hover:bg-slate-50"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          t.done
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-400"
                        }`}
                        aria-hidden
                      >
                        {t.done ? "✓" : ""}
                      </span>
                      <span className={t.done ? "text-slate-500 line-through" : "font-medium text-slate-900"}>
                        {t.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">You&apos;re clear for today.</p>
            )}
          </Card>
        </div>

        {/* Hot leads + AI */}
        <div className="space-y-6 lg:col-span-4">
          <Card>
            <SectionTitle
              icon={Flame}
              title="Hot leads"
              action={
                <Link href="/dashboard/leads?filter=hot" className="text-xs font-semibold text-[#0072ce] hover:underline">
                  View all
                </Link>
              }
            />
            {hotLeads.length ? (
              <ul className="space-y-2">
                {hotLeads.map((l, idx) => (
                  <li key={l.id}>
                    <Link
                      href={l.href}
                      className={[
                        "block rounded-xl border px-3 py-3 text-sm transition",
                        idx === 0
                          ? "border-orange-200/90 bg-gradient-to-br from-orange-50/90 to-amber-50/40 shadow-sm hover:border-orange-300/80"
                          : "border-transparent hover:bg-orange-50/80",
                      ].join(" ")}
                    >
                      <p className="font-semibold leading-snug text-slate-900">
                        <span className="mr-1.5" aria-hidden>
                          🔥
                        </span>
                        Hot Lead: <span className="font-semibold">{l.name}</span>
                      </p>
                      {l.subtitle?.trim() ? (
                        <p className="mt-1.5 line-clamp-2 text-sm font-normal leading-snug text-slate-600">
                          {l.subtitle.trim()}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No hot leads right now.</p>
            )}
          </Card>

          <Card className="border-violet-200/60 bg-gradient-to-br from-violet-50/80 to-white">
            <SectionTitle icon={Sparkles} title="AI alerts" />
            {aiAlerts.length ? (
              <ul className="space-y-2">
                {aiAlerts.map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-2 rounded-lg border border-violet-100 bg-white/80 px-3 py-2 text-sm text-slate-800"
                  >
                    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" strokeWidth={2} aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-start gap-2 text-sm text-slate-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={2} aria-hidden />
                No AI alerts yet — check back after new lead activity.
              </p>
            )}
          </Card>
        </div>

        {/* Conversations */}
        <div className="lg:col-span-3">
          <Card className="h-full min-h-[280px]">
            <SectionTitle
              icon={MessageSquare}
              title="Recent conversations"
              action={
                <Link href="/dashboard/inbox" className="text-xs font-semibold text-[#0072ce] hover:underline">
                  Inbox
                </Link>
              }
            />
            {conversations.length ? (
              <ul className="space-y-1">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={c.href ?? "/dashboard/inbox"}
                      className="block rounded-xl px-2 py-2.5 transition hover:bg-slate-50"
                    >
                      <p className="text-sm font-medium text-slate-900">{c.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{c.subtitle}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{c.at}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">No recent threads.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
