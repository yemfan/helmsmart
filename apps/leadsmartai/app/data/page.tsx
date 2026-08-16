import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { getSiteUrl } from "@/lib/siteUrl";
import { listResearchReports } from "@/lib/research/db";
import type { ResearchReportRow } from "@/lib/research/types";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const TITLE = "Data Center — Market Intelligence for Real Estate Pros | CloseBoss";
const DESCRIPTION =
  "The data behind your listing and pricing conversations. CloseBoss publishes dated, cited mortgage-rate and housing-market reports — hard numbers you can quote to sellers and buyers, every figure linked to its source.";

export async function generateMetadata(): Promise<Metadata> {
  const base = getSiteUrl();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${base}/data` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${base}/data`, type: "website" },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  };
}

function reportHref(row: ResearchReportRow): string {
  return `/data/reports/${row.slug}`;
}

function kindLabel(kind: string): string {
  return kind === "weekly_rates"
    ? "Mortgage Rates"
    : kind === "monthly_market"
      ? "Housing Market"
      : "Report";
}

function formatDate(d: string, locale: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default async function DataCenterPage() {
  const t = await getServerT();
  const locale = intlLocale(await getServerLocale());
  let reports: ResearchReportRow[] = [];
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    try {
      reports = await listResearchReports(100);
    } catch {
      reports = [];
    }
  }

  const base = getSiteUrl();
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "CloseBoss Data Center",
    description: DESCRIPTION,
    url: `${base}/data`,
    hasPart: reports.map((r) => ({
      "@type": "Article",
      headline: r.title,
      datePublished: r.published_date,
      url: `${base}${reportHref(r)}`,
    })),
  };

  return (
    <main className="bg-white text-slate-900">
      <JsonLd data={collectionJsonLd} />

      {/* Hero */}
      <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
          <nav className="mb-6 text-sm">
            <Link href="/" className="font-medium text-[#0072ce] hover:text-[#005ca8]">
              CloseBoss
            </Link>
            <span className="mx-2 text-slate-400">/</span>
            <span className="text-slate-600">{t("pages.articleChrome.dataCenter", { ns: "dashboard" })}</span>
          </nav>

          <div className="max-w-3xl">
            <p className="mb-4 inline-flex rounded-full border border-slate-200/90 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-600 shadow-sm ring-1 ring-slate-900/[0.03]">{t("pages.articleChrome.dataCenter", { ns: "dashboard" })}</p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">{t("pages.dataCenterPages.heroTitle")}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">{t("pages.dataCenterPages.heroBody")}</p>
          </div>
        </div>
      </section>

      {/* Reports list */}
      <section className="mx-auto max-w-7xl px-6 py-14 md:py-16" aria-label={t("pages.dataCenterPages.researchAria")}>
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{t("pages.dataCenterPages.researchTitle")}</h2>
          <span className="text-sm text-slate-500">{t("pages.dataCenterPages.newestFirst")}</span>
        </div>

        {reports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-slate-600">{t("pages.dataCenterPages.reportsComing")}</p>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={reportHref(r)}
                  className="block h-full rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-[#0072ce]/40 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="rounded-full bg-[#0072ce]/10 px-2.5 py-1 font-semibold text-[#0072ce]">
                      {kindLabel(r.kind)}
                    </span>
                    <span className="text-slate-500">
                      {r.period_label ?? formatDate(r.published_date, locale)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-slate-900">
                    {r.title}
                  </h3>
                  {r.dek && <p className="mt-2 text-sm leading-relaxed text-slate-600">{r.dek}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Explore local market data */}
      <section className="bg-slate-50/80" aria-label={t("pages.dataCenterPages.exploreAria")}>
        <div className="mx-auto max-w-7xl px-6 py-14 md:py-16">
          <Link
            href="/data/markets"
            className="group block max-w-3xl rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-[#0072ce]/40 hover:shadow-md"
          >
            <p className="inline-flex rounded-full bg-[#0072ce]/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[#0072ce]">{t("pages.dataCenterPages.localData")}</p>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">{t("pages.dataCenterPages.exploreTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("pages.dataCenterPages.exploreBody")}</p>
            <span className="mt-4 inline-flex items-center text-sm font-semibold text-[#0072ce] group-hover:text-[#005ca8]">
              Browse markets →
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
