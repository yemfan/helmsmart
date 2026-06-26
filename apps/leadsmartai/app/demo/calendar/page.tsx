import type { Metadata } from "next";
import { DemoShell, DemoDisabledButton } from "@/components/demo/DemoShell";
import { DEMO_DEALS, DEMO_EVENTS } from "@/lib/demo/data";

export const metadata: Metadata = {
  title: "Demo workspace · Calendar",
  description:
    "Sample RealtyBoss calendar — tours, listing presentations, callbacks, and closing calls, with linked deals and contact context.",
  alternates: { canonical: "/demo/calendar" },
  robots: { index: false, follow: true },
};

export default function DemoCalendar() {
  return (
    <DemoShell active="/demo/calendar">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Calendar
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This week · {DEMO_EVENTS.length} upcoming events ·{" "}
            {DEMO_DEALS.length} active deals
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoDisabledButton label="Connect Google Calendar" variant="ghost" />
          <DemoDisabledButton label="New event" />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Upcoming events
          </h2>
          <ul className="mt-3 space-y-3">
            {DEMO_EVENTS.map((event) => (
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
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    With {event.contactName}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Active deals
          </h2>
          <ul className="mt-3 space-y-3">
            {DEMO_DEALS.map((deal) => (
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
                <p className="mt-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Next: {deal.nextMilestone}{" "}
                  <span className="text-slate-400">
                    · in {deal.daysToMilestone} day
                    {deal.daysToMilestone === 1 ? "" : "s"}
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
