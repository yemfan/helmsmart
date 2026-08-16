import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, Phone, Sparkles } from "lucide-react";
import { DemoShell, DemoDisabledButton } from "@/components/demo/DemoShell";
import {
  DEMO_BRIEFINGS,
  DEMO_EVENTS,
  DEMO_KPIS,
  DEMO_TASKS,
} from "@/lib/demo/data";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: "Demo workspace · Overview",
  description:
    "Live read-only demo of the CloseBoss workspace — see the morning briefings, KPIs, AI follow-up activity, and today's calendar without signing up.",
  alternates: { canonical: "/demo" },
  robots: { index: false, follow: true },
};

export default async function DemoOverview() {
  const t = await getServerT();
  const locale = intlLocale(await getServerLocale());
  return (
    <DemoShell active="/demo">
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{t("pages.demoPages.greeting", { ns: "dashboard" })}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {new Date().toLocaleDateString(locale, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            · {t("pages.demoPages.sandbox", { ns: "dashboard" })}
          </p>
        </header>

        {/* Priority alerts */}
        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            2 escalated AI drafts need you
          </span>
          <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
            3 unread messages
          </span>
          <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            2 urgent tasks
          </span>
        </div>

        {/* Briefings */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("pages.demoPages.thisMorning", { ns: "dashboard" })}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {DEMO_BRIEFINGS.map((b) => (
              <article
                key={b.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <p className="text-xl" aria-hidden>
                  {b.emoji}
                </p>
                <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                  {b.title}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {b.body}
                </p>
                <p className="mt-3 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  {b.actionLabel} →
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* KPI tiles */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile
            label={t("pages.demoPages.newLeadsToday", { ns: "dashboard" })}
            value={DEMO_KPIS.newLeadsToday.toString()}
            tone="blue"
            sub="5 from Zillow / 2 from Facebook"
          />
          <KpiTile
            label={t("pages.demoPages.hotLeads", { ns: "dashboard" })}
            value={DEMO_KPIS.hotLeads.toString()}
            tone="orange"
            sub="A-scored, action required"
          />
          <KpiTile
            label={t("pages.demoPages.messagesSent", { ns: "dashboard" })}
            value={DEMO_KPIS.messagesSent.toString()}
            tone="violet"
            sub="34 AI · 4 you"
          />
          <KpiTile
            label={t("pages.demoPages.quietLeads", { ns: "dashboard" })}
            value={DEMO_KPIS.quietLeads.toString()}
            tone="amber"
            sub="7+ days inactive"
          />
        </section>

        {/* Response time + this week */}
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Clock className="h-3.5 w-3.5" aria-hidden />{t("pages.demoPages.medianResponse", { ns: "dashboard" })}</div>
            <p className="mt-2 font-heading text-3xl font-bold text-slate-900 dark:text-white">
              {DEMO_KPIS.weeklyResponseTimeSec}
              <span className="text-base font-medium text-slate-500"> sec</span>
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("pages.dashFragments.thisWeekCombined", { ns: "dashboard" })}{" "}
              <span className="font-semibold text-emerald-600">
                ↓ 12s vs last week
              </span>
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />{t("pages.demoPages.toursBooked", { ns: "dashboard" })}</div>
            <p className="mt-2 font-heading text-3xl font-bold text-slate-900 dark:text-white">
              {DEMO_KPIS.weeklyTours}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              5 booked by AI; 4 by you. 1 conversion to offer.
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Phone className="h-3.5 w-3.5" aria-hidden />{t("pages.demoPages.voiceCalls", { ns: "dashboard" })}</div>
            <p className="mt-2 font-heading text-3xl font-bold text-slate-900 dark:text-white">
              11
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              8 qualified · 3 callbacks booked · 0 dropped to voicemail
            </p>
          </article>
        </section>

        {/* Today's calendar + tasks */}
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("pages.demoPages.upcoming", { ns: "dashboard" })}</h2>
              <Link
                href="/demo/calendar"
                className="text-xs font-semibold text-blue-700 dark:text-blue-300"
              >
                Open calendar →
              </Link>
            </div>
            <ul className="mt-3 space-y-2">
              {DEMO_EVENTS.slice(0, 5).map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {event.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {event.contactName}
                    </p>
                  </div>
                  <p className="ml-3 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {event.when}
                  </p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("pages.demoPages.tasks", { ns: "dashboard" })}</h2>
              <DemoDisabledButton label={t("pages.demoPages.addTask", { ns: "dashboard" })} variant="ghost" />
            </div>
            <ul className="mt-3 space-y-2">
              {DEMO_TASKS.map((task) => (
                <li
                  key={task.id}
                  className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
                >
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        task.priority === "urgent"
                          ? "bg-red-500"
                          : task.priority === "high"
                            ? "bg-amber-500"
                            : "bg-slate-300"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {task.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {task.contactName ?? "—"} · {task.dueLabel}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </section>

        {await CtaFooter()}
      </div>
    </DemoShell>
  );
}

function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "blue" | "orange" | "violet" | "amber";
}) {
  const palette = {
    blue: { bg: "bg-blue-50 dark:bg-blue-500/10", text: "text-[#0072ce] dark:text-[#4da3e8]" },
    orange: { bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-600 dark:text-orange-300" },
    violet: { bg: "bg-violet-50 dark:bg-violet-500/10", text: "text-violet-600 dark:text-violet-300" },
    amber: { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-700 dark:text-amber-300" },
  }[tone];
  return (
    <div className={`rounded-2xl ${palette.bg} p-4`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-1 font-heading text-2xl font-bold ${palette.text}`}>
        {value}
      </p>
      <p className="mt-1 text-xs leading-4 text-slate-600 dark:text-slate-300">
        {sub}
      </p>
    </div>
  );
}

async function CtaFooter() {
  const t = await getServerT();
  return (
    <section className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-6 md:p-8 dark:border-blue-900/40 dark:from-blue-950/30 dark:via-slate-950 dark:to-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">{t("pages.demoPages.likeIt", { ns: "dashboard" })}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.demoPages.dayOne", { ns: "dashboard" })}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            14-day free trial, no credit card. Bring your own contacts via
            CSV import — or let us migrate for you.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/start-free"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >{t("pages.demoPages.startTrial", { ns: "dashboard" })}<ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/agent/compare"
            className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
          >{t("pages.demoPages.compareCrm", { ns: "dashboard" })}</Link>
        </div>
      </div>
    </section>
  );
}
