import type { Metadata } from "next";
import { DemoShell, DemoDisabledButton } from "@/components/demo/DemoShell";
import { DEMO_DEALS, DEMO_EVENTS } from "@/lib/demo/data";
import { localizeDeal, localizeEvent } from "@/lib/demo/localize";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.demoPages.metaCalendarTitle", { ns: "dashboard" }),
    description: t("pages.demoPages.metaCalendarDescription", { ns: "dashboard" }),
    alternates: { canonical: "/demo/calendar" },
    robots: { index: false, follow: true },
  };
}

export default async function DemoCalendar() {
  const t = await getServerT();
  return (
    <DemoShell active="/demo/calendar">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{t("pages.demoPages.calendar", { ns: "dashboard" })}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("pages.demoPages.calendarSubtitle", {
              ns: "dashboard",
              events: DEMO_EVENTS.length,
              deals: DEMO_DEALS.length,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoDisabledButton label={t("pages.demoPages.connectGoogle", { ns: "dashboard" })} variant="ghost" />
          <DemoDisabledButton label={t("pages.demoPages.newEvent", { ns: "dashboard" })} />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("pages.demoPages.upcomingEvents", { ns: "dashboard" })}</h2>
          <ul className="mt-3 space-y-3">
            {DEMO_EVENTS.map(localizeEvent.bind(null, t)).map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800"
              >
                <div className="inline-flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  <span className="text-[9px] font-semibold uppercase tracking-wider">
                    {event.when.split(" ")[0]}
                  </span>
                  <span className="text-xs font-bold">
                    {event.when.split(" ")[1] ?? ""}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {event.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("pages.dashFragments.with", { ns: "dashboard" })} {event.contactName}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("pages.demoPages.activeDeals", { ns: "dashboard" })}</h2>
          <ul className="mt-3 space-y-3">
            {DEMO_DEALS.map(localizeDeal.bind(null, t)).map((deal) => (
              <li
                key={deal.id}
                className="rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800"
              >
                <div className="flex flex-wrap items-start justify-between gap-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {deal.buyerName}
                  </p>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {deal.stage}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {deal.property} · ${Math.round(deal.price / 1000)}K
                </p>
                <p className="mt-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">{t("pages.dashFragments.next", { ns: "dashboard" })} {deal.nextMilestone}{" "}
                  <span className="text-slate-400">
                    {t(
                      deal.daysToMilestone === 1
                        ? "pages.demoPages.dealNextInOne"
                        : "pages.demoPages.dealNextInMany",
                      { ns: "dashboard", days: deal.daysToMilestone },
                    )}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DemoShell>
  );
}
