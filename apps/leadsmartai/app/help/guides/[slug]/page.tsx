import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuide, HELP_GUIDES } from "@/lib/help/guides";

type RouteParams = { slug: string };

export function generateStaticParams(): RouteParams[] {
  return HELP_GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) {
    return { title: "Guide not found — RealtyBoss" };
  }
  return {
    title: `${guide.title} — Help`,
    description: guide.description,
    alternates: { canonical: `/help/guides/${guide.slug}` },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url: `/help/guides/${guide.slug}`,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
    },
  };
}

/**
 * Per-guide public page. Emits both an Article JSON-LD (for general
 * indexing) and a HowTo JSON-LD (for step-by-step rich results).
 * The two payloads share the same step list, so updating the data
 * file in one place keeps the schema, the visible content, and the
 * SERP snippet consistent.
 */
export default async function HelpGuidePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const url = `https://realtybossai.com/help/guides/${guide.slug}`;

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Article",
                headline: guide.title,
                description: guide.description,
                mainEntityOfPage: { "@type": "WebPage", "@id": url },
                publisher: {
                  "@type": "Organization",
                  name: "RealtyBoss",
                  logo: {
                    "@type": "ImageObject",
                    url: "https://realtybossai.com/logo.png",
                  },
                },
              },
              {
                "@type": "HowTo",
                name: guide.title,
                description: guide.description,
                totalTime: estimateIsoDuration(guide.readTime),
                step: guide.steps.map((text, i) => ({
                  "@type": "HowToStep",
                  position: i + 1,
                  text,
                })),
              },
            ],
          }),
        }}
      />

      <article className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-slate-500">
          <Link href="/help" className="hover:text-slate-700">
            Help center
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">Guides</span>
          <span className="mx-2">/</span>
          <span className="text-slate-700">{guide.title}</span>
        </nav>

        <header>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
            {guide.readTime} read
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            {guide.title}
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            {guide.description}
          </p>
        </header>

        <div className="mt-8 space-y-4 text-base leading-7 text-slate-700">
          {guide.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Step by step
          </h2>
          <ol className="mt-4 space-y-4">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                >
                  {i + 1}
                </span>
                <p className="flex-1 text-base leading-7 text-slate-700">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {guide.related && guide.related.length > 0 ? (
          <section className="mt-12 border-t border-slate-200 pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Related
            </h2>
            <ul className="mt-4 space-y-2">
              {guide.related.map((r) => (
                <li key={r.href}>
                  <Link
                    href={r.href}
                    className="text-sm font-semibold text-blue-700 hover:underline"
                  >
                    {r.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-600">
            Need help with something else?{" "}
            <Link
              href="/help"
              className="font-semibold text-blue-700 hover:underline"
            >
              Browse all guides
            </Link>{" "}
            or{" "}
            <a
              href="mailto:contact@realtybossai.com"
              className="font-semibold text-blue-700 hover:underline"
            >
              email support
            </a>
            .
          </p>
        </section>
      </article>
    </div>
  );
}

/**
 * Convert "3 min" / "4 min" labels to ISO 8601 duration strings
 * for HowTo.totalTime. Falls back to PT3M for anything we can't
 * parse — every guide should produce a non-empty value here so the
 * rich result is eligible.
 */
function estimateIsoDuration(label: string): string {
  const match = label.match(/(\d+)\s*min/i);
  if (match) return `PT${match[1]}M`;
  return "PT3M";
}
