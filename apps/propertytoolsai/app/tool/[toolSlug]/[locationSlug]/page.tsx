import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProgressiveLeadCapture from "@/components/growth/ProgressiveLeadCapture";
import { getRelatedTools, loadProgrammaticSeoPage } from "@/lib/programmaticSeo";
import { matchLocationToGeo } from "@/lib/programmaticSeo/marketMatch";
import LocalMarketSnapshot from "@/components/LocalMarketSnapshot";

type Props = { params: Promise<{ toolSlug: string; locationSlug: string }> };

/** Allow on-demand rendering — bulk prerender (~1000+ paths) OOMs Vercel build RAM. */
export const dynamicParams = true;
/** Cache generated HTML at the edge after first request (SEO + perf). */
export const revalidate = 86400;

/** Empty at build: all /tool/* paths render on demand (see dynamicParams). */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { toolSlug, locationSlug } = await params;
  const data = await loadProgrammaticSeoPage(toolSlug, locationSlug);
  if (!data) {
    return { title: "Tool | PropertyTools AI" };
  }
  const { tool, loc, seoMeta } = data;
  const title =
    seoMeta?.title ??
    `${tool.name} in ${loc.city}, ${loc.state} | Free Online Tool | PropertyTools AI`;
  const description =
    seoMeta?.description ??
    `Free ${tool.name.toLowerCase()} for ${loc.city}, ${loc.state}. ${tool.tagline} Run scenarios, compare options, and plan your next move.`;
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://www.propertytools.ai";
  return {
    title,
    description,
    alternates: { canonical: `${base}/tool/${toolSlug}/${locationSlug}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function ProgrammaticToolLocationPage({ params }: Props) {
  const { toolSlug, locationSlug } = await params;
  const data = await loadProgrammaticSeoPage(toolSlug, locationSlug);
  if (!data) notFound();

  const { tool, loc, payload } = data;
  const toolHref = `/${tool.slug}`;
  const related = getRelatedTools(tool.slug, 5);
  const place = `${loc.city}, ${loc.state}`;

  // REAL local-market snapshot from the Data Center warehouse (ISR-safe:
  // service-role read, no cookies/headers). Null when the geo isn't active.
  const matchedGeo = await matchLocationToGeo(loc);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: payload.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <article className="mx-auto max-w-3xl px-4 py-10 space-y-10">
        <nav className="text-sm">
          <Link href="/" className="font-medium text-blue-700 hover:underline">
            PropertyTools AI
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <Link href={toolHref} className="font-medium text-blue-700 hover:underline">
            {tool.name}
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <span className="text-slate-600">{place}</span>
        </nav>

        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{tool.category}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
            {tool.name} for {place}
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed">{tool.tagline}</p>
          {payload.source === "ai" && (
            <p className="text-xs text-slate-500">Insights on this page are AI-generated and updated periodically.</p>
          )}
        </header>

        {/* Tool section */}
        <section
          aria-label="Interactive tool"
          className="rounded-2xl border-2 border-dashed border-blue-200 bg-white p-8 shadow-sm text-center space-y-4"
        >
          <h2 className="text-lg font-bold text-slate-900">Run the full {tool.name}</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Open the live calculator with your numbers for {place}. Works on mobile—perfect while touring or comparing
            listings.
          </p>
          <Link
            href={toolHref}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 text-white font-semibold px-8 py-3 text-sm hover:bg-blue-700 transition-colors"
          >
            Launch {tool.name} →
          </Link>
        </section>

        {/* Real local-market snapshot (Data Center warehouse) */}
        {matchedGeo && <LocalMarketSnapshot geo={matchedGeo} city={loc.city} />}

        {/* AI insights */}
        <section aria-label="Insights" className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Quick insights</h2>
          <ul className="space-y-3 text-slate-700 leading-relaxed">
            {payload.insights.map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-blue-600 font-bold shrink-0">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Long-form SEO */}
        <section aria-label="Guide" className="space-y-8 max-w-none">
          {payload.sections.map((sec, i) => (
            <div key={i} className="border-t border-slate-200 pt-8 first:border-t-0 first:pt-0">
              <h2 className="text-xl font-bold text-slate-900 mb-4">{sec.heading}</h2>
              <div className="space-y-4 text-slate-700 leading-relaxed">
                {sec.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* FAQs */}
        <section aria-label="FAQ" className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Frequently asked questions</h2>
          <div className="space-y-3">
            {payload.faqs.map((f, i) => (
              <details
                key={i}
                className="group rounded-xl border border-slate-200 bg-white p-4 open:shadow-sm"
              >
                <summary className="font-semibold text-slate-900 cursor-pointer list-none flex justify-between gap-2">
                  {f.question}
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTAs */}
        <section className="rounded-2xl bg-slate-900 text-white p-6 sm:p-8 space-y-4">
          <h2 className="text-xl font-bold">Go deeper</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            Get a richer breakdown, compare homes, or connect with a professional when you are ready.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/home-value"
              className="inline-flex justify-center rounded-xl bg-white text-slate-900 font-semibold px-5 py-2.5 text-sm"
            >
              Get a home value report
            </Link>
            <Link
              href="/contact"
              className="inline-flex justify-center rounded-xl border border-slate-500 font-semibold px-5 py-2.5 text-sm hover:bg-slate-800"
            >
              Talk to our team
            </Link>
            <Link
              href="/pricing"
              className="inline-flex justify-center rounded-xl border border-slate-500 font-semibold px-5 py-2.5 text-sm hover:bg-slate-800"
            >
              Unlock premium
            </Link>
          </div>
        </section>

        <ProgressiveLeadCapture
          headline={`Get ${tool.name} results for ${place} by email`}
          source={`programmatic_seo:${toolSlug}:${locationSlug}`}
        />

        {/* Internal links */}
        <section aria-label="Related tools" className="pb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Related calculators</h2>
          <ul className="grid sm:grid-cols-2 gap-2">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/tool/${r.slug}/${locationSlug}`}
                  className="block rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-blue-800 hover:border-blue-300 hover:bg-blue-50/50"
                >
                  {r.name} in {place}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  );
}
