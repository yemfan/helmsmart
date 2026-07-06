import type { Metadata } from "next";
import Link from "next/link";
import { getSiteUrl } from "@/lib/siteUrl";
import { listResearchReports } from "@/lib/research/db";
import type { ResearchReportRow } from "@/lib/research/types";

export const dynamic = "force-dynamic";

const TITLE = "Data Center — Original Housing & Mortgage Research | PropertyTools AI";
const DESCRIPTION =
  "Original, dated, and cited market research from PropertyTools AI: weekly mortgage-rate reports and monthly housing-market reports, grounded in real published data.";

export async function generateMetadata(): Promise<Metadata> {
  const base = getSiteUrl();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${base}/data` },
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  };
}

function reportHref(row: ResearchReportRow): string {
  return `/data/reports/${row.slug}`;
}

function kindLabel(kind: string): string {
  return kind === "weekly_rates" ? "Mortgage Rates" : kind === "monthly_market" ? "Housing Market" : "Report";
}

function formatDate(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default async function DataCenterPage() {
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
    name: "PropertyTools AI Data Center",
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <div className="mx-auto max-w-4xl px-4 py-12 space-y-12">
        <nav className="text-sm">
          <Link href="/" className="font-medium text-blue-700 hover:underline">
            PropertyTools AI
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <span className="text-slate-600">Data Center</span>
        </nav>

        <header className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Data Center</p>
          <h1 className="text-4xl font-bold leading-tight text-slate-900">
            Original housing &amp; mortgage research
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-slate-600">
            We publish dated, cited market reports grounded in real published data — so you can see
            where rates and the housing market are actually heading, with every number linked to its
            source.
          </p>
        </header>

        <section aria-label="Research and reports" className="space-y-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-bold text-slate-900">Research &amp; Reports</h2>
            <span className="text-sm text-slate-500">Newest first</span>
          </div>

          {reports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-slate-600">
                The first reports are on their way. Check back soon for our weekly mortgage-rate
                report and monthly housing-market report.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link
                    href={reportHref(r)}
                    className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                        {kindLabel(r.kind)}
                      </span>
                      <span className="text-slate-500">{r.period_label ?? formatDate(r.published_date)}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold leading-snug text-slate-900">{r.title}</h3>
                    {r.dek && <p className="mt-1 text-sm leading-relaxed text-slate-600">{r.dek}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-label="Coming soon"
          className="rounded-2xl border border-slate-200 bg-white/60 p-6"
        >
          <h2 className="text-lg font-bold text-slate-900">Market data by metro — coming soon</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            We&apos;re building an interactive market-data explorer with prices, inventory, and
            days-on-market broken down by metro area. For now, our published reports cover national
            trends and notable metro movers.
          </p>
        </section>
      </div>
    </div>
  );
}
