import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicNav } from "@/components/marketing/PublicNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";
import { GUIDES, getGuide, FREE_CREDITS } from "@/lib/marketing/seoContent";
import { siteUrl } from "@/lib/siteUrl";

type RouteParams = { slug: string };

export function generateStaticParams(): RouteParams[] {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

/**
 * NOTE: the canonical is set explicitly per guide. Next merges root layout
 * metadata into any page that doesn't override it, so omitting this would let
 * a root-level canonical (if one is ever added) declare every guide a duplicate
 * of the homepage.
 */
export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return { title: "Guide not found" };

  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url: `/guides/${guide.slug}`,
      type: "article",
    },
    twitter: { card: "summary_large_image", title: guide.title, description: guide.description },
  };
}

export default async function GuidePage({ params }: { params: Promise<RouteParams> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const url = `${siteUrl()}/guides/${guide.slug}`;
  const related = (guide.related ?? []).map(getGuide).filter((g): g is NonNullable<typeof g> => g !== null);

  return (
    <>
      <PublicNav />
      {/*
        Article + HowTo + FAQPage share the same source arrays as the visible
        markup, so the rich-result snippet can never drift from the page.
      */}
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
                publisher: { "@type": "Organization", name: "MarketingBoss", url: siteUrl() },
              },
              {
                "@type": "HowTo",
                name: guide.title,
                description: guide.description,
                step: guide.steps.map((s, i) => ({
                  "@type": "HowToStep",
                  position: i + 1,
                  name: s.name,
                  text: s.text,
                })),
              },
              {
                "@type": "FAQPage",
                mainEntity: guide.faq.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
            ],
          }),
        }}
      />

      <main className="mx-auto max-w-3xl px-5 py-14">
        <nav className="text-sm text-ink-3">
          <Link href="/guides" className="hover:text-boss-violet">
            Guides
          </Link>
          <span className="mx-2">/</span>
          <span>{guide.category}</span>
        </nav>

        <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-ink">{guide.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-3">{guide.intro}</p>

        <section className="mt-10">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Step by step</h2>
          <ol className="mt-5 space-y-4">
            {guide.steps.map((s, i) => (
              <li key={s.name} className="flex gap-4 rounded-2xl border border-line bg-white p-5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-boss-violet text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-ink">{s.name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-3">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {guide.sections.map((s) => (
          <section key={s.heading} className="mt-10">
            <h2 className="text-2xl font-bold tracking-tight text-ink">{s.heading}</h2>
            <p className="mt-3 leading-relaxed text-ink-3">{s.body}</p>
          </section>
        ))}

        <section className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Common questions</h2>
          <dl className="mt-5 space-y-4">
            {guide.faq.map((f) => (
              <div key={f.q} className="rounded-2xl border border-line bg-white p-5">
                <dt className="font-semibold text-ink">{f.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-ink-3">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {related.length > 0 ? (
          <section className="mt-12">
            <h2 className="text-lg font-semibold text-ink">Related guides</h2>
            <ul className="mt-3 space-y-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link href={`/guides/${r.slug}`} className="text-boss-violet hover:underline">
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-12 rounded-2xl border border-line bg-white/70 p-6">
          <h2 className="text-lg font-semibold text-ink">Try it yourself</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">
            MarketingBoss generates the creative, writes the caption and publishes on your schedule.{" "}
            {FREE_CREDITS} free credits, no card.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105"
          >
            Start creating free
          </Link>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
