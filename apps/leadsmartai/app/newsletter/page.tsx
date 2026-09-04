import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { getSiteUrl } from "@/lib/siteUrl";
import SubscribeForm from "@/components/newsletter/SubscribeForm";
import { listRegionOptions } from "@/lib/newsletter/regions";
import { listRecentDigests, type NewsletterDigestRow } from "@/lib/newsletter/db";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const TITLE =
  "Weekly Housing & Rates Newsletter — By Region | CloseBoss";
const DESCRIPTION =
  "Your weekly rates + housing briefing, by region. CloseBoss sends a plain-English digest of mortgage rates and the national housing market, paired with a local market snapshot for your state or metro — every figure linked to its source.";

export async function generateMetadata(): Promise<Metadata> {
  const base = getSiteUrl();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${base}/newsletter` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${base}/newsletter`, type: "website" },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  };
}

function formatWeek(d: string, locale: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default async function NewsletterHubPage() {
  const t = await getServerT();
  const locale = intlLocale(await getServerLocale());
  const [regions, digests] = await Promise.all([
    listRegionOptions(),
    listRecentDigests(24),
  ]);

  const base = getSiteUrl();
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "CloseBoss Weekly Housing & Rates Newsletter",
    description: DESCRIPTION,
    url: `${base}/newsletter`,
    hasPart: digests.map((d) => ({
      "@type": "Article",
      headline: d.title,
      datePublished: d.week_of,
      url: `${base}/newsletter/national/${d.week_of}`,
    })),
  };

  return (
    <main className="bg-white text-slate-900">
      <JsonLd data={collectionJsonLd} />

      {/* Hero */}
      <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-20">
          <nav className="mb-6 text-sm">
            <Link href="/" className="font-medium text-[#0072ce] hover:text-[#005ca8]">
              CloseBoss
            </Link>
            <span className="mx-2 text-slate-400">/</span>
            <span className="text-slate-600">{t("pages.newsletterIndex.weeklyNewsletter", { ns: "dashboard" })}</span>
          </nav>

          <div className="max-w-3xl">
            <p className="mb-4 inline-flex rounded-full border border-slate-200/90 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-600 shadow-sm ring-1 ring-slate-900/[0.03]">{t("pages.newsletterIndex.weeklyNewsletter", { ns: "dashboard" })}</p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">{t("pages.newsletterIndex.h1", { ns: "dashboard" })}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">{t("pages.newsletterIndex.sub", { ns: "dashboard" })}</p>
          </div>

          <div className="mt-8 max-w-3xl">
            <SubscribeForm regions={regions} defaultSlug="national" />
          </div>
        </div>
      </section>

      {/* Recent issues */}
      <section className="mx-auto max-w-5xl px-6 py-14 md:py-16" aria-label={t("pages.newsletterIndex.recentIssuesAria", { ns: "dashboard" })}>
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{t("pages.newsletterIndex.recentIssues", { ns: "dashboard" })}</h2>
          <span className="text-sm text-slate-500">{t("pages.newsletterIndex.newestFirst", { ns: "dashboard" })}</span>
        </div>

        {digests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-slate-600">{t("pages.newsletterIndex.firstIssueComing", { ns: "dashboard" })}</p>
          </div>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {digests.map((d: NewsletterDigestRow) => (
              <li key={d.id}>
                <Link
                  href={`/newsletter/national/${d.week_of}`}
                  className="block h-full rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-[#0072ce]/40 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="rounded-full bg-[#0072ce]/10 px-2.5 py-1 font-semibold text-[#0072ce]">{t("pages.newsletterIndex.weekOf", { ns: "dashboard" })} {formatWeek(d.week_of, locale)}
                    </span>
                    <span className="text-slate-500">
                      {t("pages.newsletter.storyCount", { count: Array.isArray(d.items) ? d.items.length : 0, ns: "dashboard" })}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-slate-900">
                    {d.title}
                  </h3>
                  {d.intro && (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">
                      {d.intro}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Region picker — jump to the latest issue for a specific market. */}
        {digests.length > 0 && regions.length > 1 && (
          <div className="mt-10 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("pages.newsletterIndex.readThisWeek", { ns: "dashboard" })}</h3>
            <p className="mt-1 text-sm text-slate-600">{t("pages.newsletterIndex.sameBriefing", { ns: "dashboard" })}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {regions.slice(0, 24).map((r) => (
                <Link
                  key={`${r.level}-${r.code}`}
                  href={`/newsletter/${r.slug}/${digests[0].week_of}`}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-[#0072ce]/40 hover:text-[#0072ce]"
                >
                  {r.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
