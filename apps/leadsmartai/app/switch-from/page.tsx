import type { Metadata } from "next";
import Link from "next/link";
import { SWITCH_SOURCES } from "@/lib/marketing/switch-from";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.switchFrom.title", { ns: "web_marketing" });
  const description = t("routeMeta.switchFrom.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: [
    "real estate CRM migration",
    "LionDesk alternative",
    "Follow Up Boss alternative",
    "kvCORE alternative",
    "switch CRM",
    "CloseBoss migration",
  ],
  alternates: { canonical: "/switch-from" },
  openGraph: {
    title,
    description:
      "Migration guides for LionDesk, Follow Up Boss, kvCORE, and more — with free concierge migration through 2026.",
    url: "/switch-from",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description:
      "Migration guides + free concierge migration for agents leaving LionDesk, FUB, kvCORE, and more.",
  },
};
}

const SITE_URL = "https://closebossai.com";

export default async function SwitchFromIndex() {
  const t = await getServerT();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Switch your CRM to CloseBoss",
    url: `${SITE_URL}/switch-from`,
    description:
      "Migration guides for LionDesk, Follow Up Boss, kvCORE, and more.",
    hasPart: SWITCH_SOURCES.map((s) => ({
      "@type": "WebPage",
      name: `Switch from ${s.name} to CloseBoss`,
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">{t("pages.switchFromPages.crmMigration", { ns: "dashboard" })}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl dark:text-white">{t("pages.switchFromPages.heroTitle", { ns: "dashboard" })}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">{t("pages.switchFromPages.heroSub", { ns: "dashboard" })}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >{t("pages.switchFromPages.startTrial", { ns: "dashboard" })}</Link>
            <Link
              href="/contact?topic=concierge-migration"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >{t("pages.switchFromPages.requestConcierge", { ns: "dashboard" })}</Link>
          </div>
        </header>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.switchFromPages.pickYourCrm", { ns: "dashboard" })}</h2>
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
                  <h3 className="mt-2 text-base font-semibold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">{t("pages.switchFromPages.switchFrom", { ns: "dashboard" })} {source.name}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {t(source.heroSubhead, { ns: "dashboard" })}
                  </p>
                  {source.urgencyBanner ? (
                    <p className="mt-3 inline-flex w-fit items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{t("pages.switchFromPages.timeSensitive", { ns: "dashboard" })}</p>
                  ) : null}
                  <span className="mt-auto pt-4 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    {t("pages.switchFromPages.readGuide", { ns: "dashboard" })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">{t("pages.switchFromPages.dontSeeYours", { ns: "dashboard" })}{" "}
            <Link
              href="/contact?topic=concierge-migration"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >{t("pages.switchFromPages.tellUsLeaving", { ns: "dashboard" })}</Link>{" "}
            {t("pages.switchFromPages.helpRegardless", { ns: "dashboard" })}
          </p>
        </section>

        <section className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-10 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold text-slate-900 md:text-2xl dark:text-white">{t("pages.switchFromPages.howItWorks", { ns: "dashboard" })}</h2>
          <ol className="mt-5 space-y-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              >
                1
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">{t("pages.switchFromPages.s1Title", { ns: "dashboard" })}</span>{" "}{t("pages.switchFromPages.s1Body", { ns: "dashboard" })}</span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              >
                2
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">{t("pages.switchFromPages.s2Title", { ns: "dashboard" })}</span>{" "}{t("pages.switchFromPages.s2Body", { ns: "dashboard" })}</span>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
              >
                3
              </span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-white">{t("pages.switchFromPages.s3Title", { ns: "dashboard" })}</span>{" "}{t("pages.switchFromPages.s3Body", { ns: "dashboard" })}</span>
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
                </span>{" "}{t("pages.switchFromPages.s4Body", { ns: "dashboard" })}</span>
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
                </span>{" "}{t("pages.switchFromPages.guarantee", { ns: "dashboard" })}</span>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
