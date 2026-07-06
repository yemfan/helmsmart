import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteUrl } from "@/lib/siteUrl";
import { getResearchReport } from "@/lib/research/db";
import type { ResearchReportRow, ResearchSource } from "@/lib/research/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function formatDate(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const report = await getResearchReport(slug);
  if (!report) return { title: "Report | PropertyTools AI Data Center" };

  const base = getSiteUrl();
  const description = report.dek ?? `${report.title} — original, cited market research from PropertyTools AI.`;
  return {
    title: `${report.title} | PropertyTools AI`,
    description,
    alternates: { canonical: `${base}/data/reports/${report.slug}` },
    openGraph: {
      title: report.title,
      description,
      type: "article",
      publishedTime: report.published_date,
    },
  };
}

/** Resolve the publisher label for a stat's cited source. */
function sourceForStat(report: ResearchReportRow, idx: number): ResearchSource | null {
  const sources = report.sources ?? [];
  if (idx < 0 || idx >= sources.length) return null;
  return sources[idx];
}

export default async function ResearchReportPage({ params }: Props) {
  const { slug } = await params;
  const report = await getResearchReport(slug);
  if (!report) notFound();

  const base = getSiteUrl();
  const consumer = report.analysis_consumer;
  const keyStats = report.key_stats ?? [];
  const dataTable = report.data_table;
  const sources = report.sources ?? [];

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: report.title,
    description: report.dek ?? undefined,
    datePublished: report.published_date,
    dateModified: report.updated_at,
    author: { "@type": "Organization", name: "PropertyTools AI" },
    publisher: { "@type": "Organization", name: "PropertyTools AI" },
    mainEntityOfPage: `${base}/data/reports/${report.slug}`,
  };

  const faqJsonLd =
    consumer.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: consumer.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      {faqJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      )}

      <article className="mx-auto max-w-3xl px-4 py-10 space-y-10">
        <nav className="text-sm">
          <Link href="/" className="font-medium text-blue-700 hover:underline">
            PropertyTools AI
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <Link href="/data" className="font-medium text-blue-700 hover:underline">
            Data Center
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <span className="text-slate-600">Report</span>
        </nav>

        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            {report.period_label ?? formatDate(report.published_date)}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight text-slate-900">{report.title}</h1>
          {report.dek && <p className="text-lg leading-relaxed text-slate-600">{report.dek}</p>}
          <p className="text-xs text-slate-500">
            Published {formatDate(report.published_date)} · Grounded in the cited sources below.
          </p>
        </header>

        {keyStats.length > 0 && (
          <section aria-label="Key stats" className="grid gap-3 sm:grid-cols-2">
            {keyStats.map((stat, i) => {
              const src = sourceForStat(report, stat.sourceIndex);
              return (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{stat.value}</p>
                  {src && (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener"
                      className="mt-1 inline-block text-xs text-blue-700 hover:underline"
                    >
                      Source: {src.publisher || src.title}
                    </a>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {dataTable && (
          <section aria-label="Data table" className="space-y-2">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    {dataTable.columns.map((col, i) => (
                      <th key={i} className="px-4 py-2 font-semibold text-slate-700">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataTable.rows.map((row, ri) => (
                    <tr key={ri} className="border-t border-slate-100">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-4 py-2 text-slate-700">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dataTable.caption && <p className="text-xs text-slate-500">{dataTable.caption}</p>}
          </section>
        )}

        <section aria-label="Analysis" className="space-y-8">
          {consumer.sections.map((sec, i) => (
            <div key={i} className="border-t border-slate-200 pt-8 first:border-t-0 first:pt-0">
              {sec.heading && <h2 className="mb-4 text-xl font-bold text-slate-900">{sec.heading}</h2>}
              <div className="space-y-4 leading-relaxed text-slate-700">
                {sec.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
            </div>
          ))}
        </section>

        {consumer.faqs.length > 0 && (
          <section aria-label="FAQ" className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">FAQ</h2>
            <div className="space-y-3">
              {consumer.faqs.map((f, i) => (
                <details key={i} className="group rounded-xl border border-slate-200 bg-white p-4 open:shadow-sm">
                  <summary className="flex cursor-pointer list-none justify-between gap-2 font-semibold text-slate-900">
                    {f.q}
                    <span className="text-slate-400 transition-transform group-open:rotate-180">▼</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        {sources.length > 0 && (
          <section aria-label="Sources" className="space-y-3 border-t border-slate-200 pt-8">
            <h2 className="text-lg font-bold text-slate-900">Sources</h2>
            <p className="text-sm text-slate-500">
              Every figure in this report links to its primary source. We cite openly so you can
              verify the numbers yourself.
            </p>
            <ol className="space-y-2 text-sm">
              {sources.map((src, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 font-semibold text-slate-400">{i + 1}.</span>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener"
                    className="text-blue-700 hover:underline"
                  >
                    {src.title}
                    {src.publisher && <span className="text-slate-500"> — {src.publisher}</span>}
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>
    </div>
  );
}
