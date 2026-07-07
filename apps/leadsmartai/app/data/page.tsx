import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { getSiteUrl } from "@/lib/siteUrl";
import { listResearchReports } from "@/lib/research/db";
import type { ResearchReportRow } from "@/lib/research/types";

export const dynamic = "force-dynamic";

const TITLE = "Data Center — Market Intelligence for Real Estate Pros | RealtyBoss";
const DESCRIPTION =
  "The data behind your listing and pricing conversations. RealtyBoss publishes dated, cited mortgage-rate and housing-market reports — hard numbers you can quote to sellers and buyers, every figure linked to its source.";

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
    name: "RealtyBoss Data Center",
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
              RealtyBoss
            </Link>
            <span className="mx-2 text-slate-400">/</span>
            <span className="text-slate-600">Data Center</span>
          </nav>

          <div className="max-w-3xl">
            <p className="mb-4 inline-flex rounded-full border border-slate-200/90 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-600 shadow-sm ring-1 ring-slate-900/[0.03]">
              Data Center
            </p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Market intelligence for real estate pros
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              The data behind your listing and pricing conversations. We publish dated, cited
              mortgage-rate and housing-market reports so you can walk into every appointment with
              hard numbers — and back each one with a link to its source when a seller pushes back.
            </p>
          </div>
        </div>
      </section>

      {/* Reports list */}
      <section className="mx-auto max-w-7xl px-6 py-14 md:py-16" aria-label="Research and reports">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Research &amp; Reports</h2>
          <span className="text-sm text-slate-500">Newest first</span>
        </div>

        {reports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-slate-600">
              The first reports are on their way. Check back soon for our weekly mortgage-rate
              report and monthly housing-market report — the talking points for your next listing
              appointment.
            </p>
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
                      {r.period_label ?? formatDate(r.published_date)}
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

      {/* Coming soon */}
      <section className="bg-slate-50/80" aria-label="Coming soon">
        <div className="mx-auto max-w-7xl px-6 py-14 md:py-16">
          <div className="max-w-3xl rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm ring-1 ring-slate-900/[0.03]">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Market data by metro — coming soon
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              We&apos;re building an interactive market-data explorer with prices, inventory, and
              days-on-market broken down by metro — the local proof points buyers and sellers ask
              for. For now, our published reports cover national trends and notable metro movers.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
