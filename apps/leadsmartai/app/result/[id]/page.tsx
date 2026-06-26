import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ResultViewBeacon from "@/components/growth/ResultViewBeacon";
import ProgressiveLeadCapture from "@/components/growth/ProgressiveLeadCapture";
import { getShareableResultById } from "@/lib/growth/shareableResults";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const row = await getShareableResultById(id);
  // Per-user shared calculator results — thin, one-off, no SEO value. Keep them
  // out of the index so they don't pile up as "crawled, not indexed" in GSC.
  const robots = { index: false, follow: false } as const;
  if (!row) return { title: "Result | RealtyBoss", robots };
  return {
    title: `${row.title} | RealtyBoss`,
    description: row.summary ?? "Shared calculator result",
    robots,
    openGraph: { title: row.title, description: row.summary ?? undefined },
  };
}

export default async function SharedResultPage({ params }: Props) {
  const { id } = await params;
  const row = await getShareableResultById(id);
  if (!row) notFound();

  const entries = Object.entries(row.result_json ?? {}).slice(0, 12);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <ResultViewBeacon id={id} />
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        <Link href="/" className="text-sm font-medium text-blue-700">
          ← RealtyBoss
        </Link>
        <header>
          <p className="text-xs font-semibold uppercase text-slate-500">{row.tool_slug.replace(/-/g, " ")}</p>
          <h1 className="text-2xl font-bold mt-1">{row.title}</h1>
          {row.summary && <p className="text-slate-600 mt-2 text-sm leading-relaxed">{row.summary}</p>}
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-3">Results</h2>
          <dl className="space-y-2 text-sm">
            {entries.length ? (
              entries.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-slate-500 capitalize">{k.replace(/_/g, " ")}</dt>
                  <dd className="font-medium text-right">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                </div>
              ))
            ) : (
              <p className="text-slate-500">No structured fields.</p>
            )}
          </dl>
          <p className="text-[11px] text-slate-400 mt-4">{row.view_count} views</p>
        </section>

        <ProgressiveLeadCapture headline="Talk to an agent about these numbers" />

        <p className="text-xs text-slate-500 text-center">
          Want your own analysis? Try our calculators on the homepage.
        </p>
      </div>
    </div>
  );
}
