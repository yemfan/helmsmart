import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicNav } from "@/components/marketing/PublicNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";
import { COMPARISONS, getComparison, FREE_CREDITS } from "@/lib/marketing/seoContent";
import { siteUrl } from "@/lib/siteUrl";

type RouteParams = { slug: string };

export function generateStaticParams(): RouteParams[] {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { slug } = await params;
  const c = getComparison(slug);
  if (!c) return { title: "Comparison not found" };

  return {
    title: c.title,
    description: c.description,
    alternates: { canonical: `/compare/${c.slug}` },
    openGraph: { title: c.title, description: c.description, url: `/compare/${c.slug}`, type: "article" },
    twitter: { card: "summary_large_image", title: c.title, description: c.description },
  };
}

export default async function ComparisonPage({ params }: { params: Promise<RouteParams> }) {
  const { slug } = await params;
  const c = getComparison(slug);
  if (!c) notFound();

  return (
    <>
      <PublicNav />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: c.faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />

      <main className="mx-auto max-w-3xl px-5 py-14">
        <nav className="text-sm text-ink-3">
          <Link href="/compare" className="hover:text-boss-violet">
            Compare
          </Link>
          <span className="mx-2">/</span>
          <span>{c.competitor}</span>
        </nav>

        <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-ink">{c.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-3">{c.description}</p>

        <section className="mt-10 rounded-2xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold text-ink">What {c.competitor} is for</h2>
          <p className="mt-2 leading-relaxed text-ink-3">{c.theirFocus}</p>
        </section>

        <section className="mt-6 rounded-2xl border border-boss-violet/30 bg-boss-violet/[0.04] p-6">
          <h2 className="text-lg font-semibold text-ink">The short answer</h2>
          <p className="mt-2 leading-relaxed text-ink-3">{c.verdict}</p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Where they differ</h2>
          <div className="mt-5 space-y-4">
            {c.differences.map((d) => (
              <div key={d.dimension} className="rounded-2xl border border-line bg-white p-5">
                <h3 className="font-semibold text-ink">{d.dimension}</h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-boss-violet/[0.06] p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-boss-violet">MarketingBoss</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-ink-3">{d.us}</dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-3">{c.competitor}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-ink-3">{d.them}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>

        {/* Saying plainly when the other tool wins is the whole reason anyone
            trusts a vendor-written comparison. */}
        <section className="mt-10">
          <h2 className="text-2xl font-bold tracking-tight text-ink">When {c.competitor} is the better choice</h2>
          <ul className="mt-4 space-y-2.5">
            {c.chooseThemIf.map((reason) => (
              <li key={reason} className="flex gap-3 text-ink-3">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-3" />
                <span className="leading-relaxed">{reason}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Common questions</h2>
          <dl className="mt-5 space-y-4">
            {c.faq.map((f) => (
              <div key={f.q} className="rounded-2xl border border-line bg-white p-5">
                <dt className="font-semibold text-ink">{f.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-ink-3">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-12 rounded-2xl border border-line bg-white/70 p-6">
          <h2 className="text-lg font-semibold text-ink">See it for yourself</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">
            {FREE_CREDITS} free credits, no card. Generate something and publish it in a few minutes.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-xl bg-boss-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-105"
          >
            Start creating free
          </Link>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-ink-3">
          {c.competitor} is a trademark of its respective owner and is named here only to describe how the products
          differ. Their capabilities and pricing change — check {c.competitor}&rsquo;s own site for current details.
        </p>
      </main>
      <PublicFooter />
    </>
  );
}
