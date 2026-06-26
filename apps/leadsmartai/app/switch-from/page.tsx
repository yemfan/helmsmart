import type { Metadata } from "next";
import Link from "next/link";
import { SWITCH_SOURCES } from "@/lib/marketing/switch-from";

export const metadata: Metadata = {
  title: "Switch your CRM to RealtorBoss",
  description:
    "Migration guides for agents leaving LionDesk, Follow Up Boss, kvCORE, and more. Free concierge migration through 2026 — we'll move your data and rebuild your sequences in under a week.",
  keywords: [
    "real estate CRM migration",
    "LionDesk alternative",
    "Follow Up Boss alternative",
    "kvCORE alternative",
    "switch CRM",
    "RealtorBoss migration",
  ],
  alternates: { canonical: "/switch-from" },
  openGraph: {
    title: "Switch your CRM to RealtorBoss",
    description:
      "Migration guides for LionDesk, Follow Up Boss, kvCORE, and more — with free concierge migration through 2026.",
    url: "/switch-from",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Switch your CRM to RealtorBoss",
    description:
      "Migration guides + free concierge migration for agents leaving LionDesk, FUB, kvCORE, and more.",
  },
};

const SITE_URL = "https://realtybossai.com";

export default function SwitchFromIndex() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Switch your CRM to RealtorBoss",
    url: `${SITE_URL}/switch-from`,
    description:
      "Migration guides for LionDesk, Follow Up Boss, kvCORE, and more.",
    hasPart: SWITCH_SOURCES.map((s) => ({
      "@type": "WebPage",
      name: `Switch from ${s.name} to RealtorBoss`,
      url: `${SITE_URL}/switch-from/${s.slug}`,
      description: s.heroSubhead,
    })),
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
            CRM Migration
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl dark:text-white">
            Switching CRMs? We&apos;ll do the heavy lifting.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            Migration guides for the most common CRMs solo agents leave
            — with a free concierge migration through 2026 for agents
            moving from LionDesk, Follow Up Boss, or kvCORE.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Start 14-day free trial
            </Link>
            <Link
              href="/contact?topic=concierge-migration"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >
              Request concierge migration
            </Link>
          </div>
        </header>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            Pick your current CRM
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SWITCH_SOURCES.map((source) => (
              <li key={source.slug}>
                <Link
                  href={`/switch-from/${source.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900/60"
                >
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <span>{source.priceRange}</span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
                    Switch from {source.name}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {source.heroSubhead}
                  </p>
                  {source.urgencyBanner ? (
                    <p className="mt-3 inline-flex w-fit items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                      Time-sensitive
                    </p>
                  ) : null}
                  <span className="mt-auto pt-4 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    Read the migration guide →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
            Don&apos;t see your current CRM?{" "}
            <Link
              href="/contact?topic=concierge-migration"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              Tell us what you&apos;re leaving
            </Link>{" "}
            — we&apos;ll help regardless.
          </p>
        </section>

        <section className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-10 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold text-slate-900 md:text-2xl dark:text-white">
            How the concierge migration works
          </h2>
          <ol className="mt-5 space-y-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              >
                1
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  Tell us what you&apos;re leaving.
                </span>{" "}
                Submit the concierge form with your current CRM and
                approximate contact count. We&apos;ll reply within 1
                business day.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              >
                2
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  We export + import for you.
                </span>{" "}
                Duplicates merged, custom fields preserved, source
                attribution kept intact.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              >
                3
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  We rebuild your sequences.
                </span>{" "}
                Your three most-used drips re-created in
                LeadSmart&apos;s template library with your copy +
                cadence.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              >
                4
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  30-minute onboarding call.
                </span>{" "}
                Live walkthrough of your workspace, AI follow-up
                policy, and missed-call settings.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              >
                5
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  5-business-day guarantee.
                </span>{" "}
                If we can&apos;t get you live within 5 business days,
                your first 3 months on Pro tier are free.
              </span>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
