import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildGuidePath } from "@/lib/clusterGenerator/slug";
import { getClusterPage } from "@/lib/clusterGenerator/db";
import { listPublishedClusterParams } from "@/lib/clusterGenerator/db";
import { matchLocationToGeo } from "@/lib/programmaticSeo/marketMatch";
import LocalMarketSnapshot from "@/components/LocalMarketSnapshot";

type Props = { params: Promise<{ topicSlug: string; locationSlug: string }> };

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return [];
  try {
    const params = await listPublishedClusterParams();
    return params.slice(0, 8000).map((p) => ({
      topicSlug: p.topicSlug,
      locationSlug: p.locationSlug,
    }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topicSlug, locationSlug } = await params;
  const row = await getClusterPage(topicSlug, locationSlug);
  if (!row) return { title: "Guide | PropertyTools AI" };

  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://www.propertytools.ai";
  const path = buildGuidePath(topicSlug, locationSlug);
  return {
    title: row.title,
    description: row.meta_description,
    alternates: { canonical: `${base}${path}` },
    openGraph: { title: row.title, description: row.meta_description, type: "article" },
  };
}

export default async function ClusterGuidePage({ params }: Props) {
  const { topicSlug, locationSlug } = await params;
  const row = await getClusterPage(topicSlug, locationSlug);
  if (!row) notFound();

  const place = `${row.city}, ${row.state}`;
  const payload = row.payload;
  const links = Array.isArray(row.internal_links) ? row.internal_links : [];

  // Real local-market data from the Data Center warehouse for this guide's
  // city (metro match, state fallback). Service-role/server-only read → ISR-safe.
  const marketGeo = await matchLocationToGeo({
    slug: locationSlug,
    city: row.city,
    state: row.state,
  });

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <article className="mx-auto max-w-3xl px-4 py-10 space-y-10">
        <nav className="text-sm">
          <Link href="/" className="font-medium text-blue-700 hover:underline">
            PropertyTools AI
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <Link href="/guides" className="font-medium text-blue-700 hover:underline">
            Guides
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <span className="text-slate-600">{place}</span>
        </nav>

        <header className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Local guide</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">{row.title}</h1>
          <p className="text-lg text-slate-600 leading-relaxed">{row.meta_description}</p>
          {payload.source === "ai" && (
            <p className="text-xs text-slate-500">Content is AI-assisted and reviewed for quality; verify details with a licensed professional.</p>
          )}
        </header>

        <section aria-label="Insights" className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Key takeaways</h2>
          <ul className="space-y-3 text-slate-700 leading-relaxed">
            {payload.insights.map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-blue-600 font-bold shrink-0">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {marketGeo && <LocalMarketSnapshot geo={marketGeo} city={row.city} />}

        <section aria-label="Guide" className="space-y-8">
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

        <section aria-label="FAQ" className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">FAQ</h2>
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

        {links.length > 0 && (
          <section aria-label="Related guides" className="pb-8">
            <h2 className="text-lg font-bold text-slate-900 mb-3">Related guides in {row.city}</h2>
            <ul className="grid sm:grid-cols-2 gap-2">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-blue-800 hover:border-blue-300 hover:bg-blue-50/50"
                  >
                    {l.anchor}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}
