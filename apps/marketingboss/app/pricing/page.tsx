import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/marketing/PublicNav";
import { PublicFooter } from "@/components/marketing/PublicFooter";
import { CREDIT_PACKS, SUBSCRIPTION_PLANS, formatPrice } from "@/lib/billing";
import { CREDIT_COST, FREE_CREDITS, PLATFORMS } from "@/lib/marketing/seoContent";
import { siteUrl } from "@/lib/siteUrl";

/**
 * Standalone /pricing.
 *
 * The homepage carries a #pricing section, but "pricing" is the highest
 * commercial-intent query a SaaS can own and an anchor can't rank for it — a
 * real URL can. Both read from lib/billing, so there is exactly one source of
 * truth for what things cost.
 */

export const metadata: Metadata = {
  title: "Pricing — pay for what you create",
  description: `Start with ${FREE_CREDITS} free credits, no card. Then a monthly plan for the best per-credit rate, or one-time top-ups. Images from ${CREDIT_COST.image} credit, video from ${CREDIT_COST.video}.`,
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "MarketingBoss pricing — pay for what you create",
    description: `${FREE_CREDITS} free credits to start. No seats, no subscription required.`,
    url: "/pricing",
    type: "website",
  },
};

const COSTS = [
  { label: "Image", credits: CREDIT_COST.image, note: "any generation — ads, product shots, thumbnails, graphics" },
  { label: "Edit", credits: CREDIT_COST.edit, note: "refine or restyle an existing render" },
  { label: "Video", credits: CREDIT_COST.video, note: "a cinematic clip, text-to-video or from a still" },
];

const FAQ = [
  {
    q: "Do I need a subscription?",
    a: "No. Credit packs are one-time purchases that never expire on a monthly cycle. A subscription simply gets you a better per-credit rate if you create regularly.",
  },
  {
    q: "Do I pay per seat?",
    a: "No. There are no seats and no per-channel charges. You pay for generation, and publishing to your connected accounts is included.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "Generation stops until you top up — nothing is deleted and everything already in your gallery stays yours. Top-ups apply immediately.",
  },
  {
    q: "Is there a free trial?",
    a: `Every new account starts with ${FREE_CREDITS} free credits and no card required — enough to generate ${FREE_CREDITS} images or a couple of video clips before deciding.`,
  },
];

export default function PricingPage() {
  const url = `${siteUrl()}/pricing`;

  return (
    <>
      <PublicNav />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "FAQPage",
                "@id": `${url}#faq`,
                mainEntity: FAQ.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
              ...SUBSCRIPTION_PLANS.map((p) => ({
                "@type": "Product",
                name: `MarketingBoss ${p.name}`,
                description: p.blurb,
                offers: {
                  "@type": "Offer",
                  price: (p.priceCents / 100).toFixed(2),
                  priceCurrency: "USD",
                  url,
                },
              })),
            ],
          }),
        }}
      />

      <main className="mx-auto max-w-6xl px-5 py-14">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-boss-violet">Pricing</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
            Start free. Pay for what you create.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-3">
            Every account starts with {FREE_CREDITS} free credits — no card. After that, pick a monthly plan for
            credits at the best rate, or top up one-time as you go. No seats, no per-channel fees, and every render
            stays in your gallery.
          </p>
        </header>

        {/* What a generation costs */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold tracking-tight text-ink">What a generation costs</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {COSTS.map((c) => (
              <div key={c.label} className="rounded-2xl border border-line bg-white p-6">
                <h3 className="text-base font-semibold text-ink">{c.label}</h3>
                <p className="mt-1 text-2xl font-extrabold text-boss-violet">
                  {c.credits} {c.credits === 1 ? "credit" : "credits"}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{c.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Monthly plans */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Monthly plans</h2>
          <p className="mt-2 text-ink-3">Best per-credit rate. Credits land on every paid invoice. Cancel anytime.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {SUBSCRIPTION_PLANS.map((p) => (
              <div
                key={p.id}
                className={`rounded-2xl border bg-white p-6 ${
                  p.popular ? "border-boss-violet shadow-lg shadow-boss-violet/10" : "border-line"
                }`}
              >
                {p.popular ? (
                  <span className="rounded-full bg-boss-violet/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-boss-violet">
                    Most popular
                  </span>
                ) : null}
                <h3 className="mt-3 text-lg font-semibold text-ink">{p.name}</h3>
                <p className="mt-1 text-3xl font-extrabold text-ink">
                  {formatPrice(p.priceCents)}
                  <span className="text-base font-medium text-ink-3">/mo</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-boss-violet">
                  {p.creditsPerMonth.toLocaleString()} credits / month
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-3">{p.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        {/* One-time packs */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight text-ink">One-time credit packs</h2>
          <p className="mt-2 text-ink-3">No subscription. Buy credits, spend them whenever.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {CREDIT_PACKS.map((p) => (
              <div
                key={p.id}
                className={`rounded-2xl border bg-white p-6 ${
                  p.popular ? "border-boss-violet shadow-lg shadow-boss-violet/10" : "border-line"
                }`}
              >
                <h3 className="text-lg font-semibold text-ink">{p.name}</h3>
                <p className="mt-1 text-3xl font-extrabold text-ink">{formatPrice(p.priceCents)}</p>
                <p className="mt-1 text-sm font-semibold text-boss-violet">
                  {p.credits.toLocaleString()} credits
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-3">{p.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Included */}
        <section className="mt-14 rounded-2xl border border-line bg-white/70 p-6">
          <h2 className="text-lg font-semibold text-ink">Included on every plan</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">
            Publishing to {PLATFORMS.join(", ")} · weekly autopilot · caption writing per platform · unlimited
            gallery storage for everything you render. Credits are only ever spent on generation.
          </p>
        </section>

        {/* FAQ */}
        <section className="mt-14 max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight text-ink">Pricing questions</h2>
          <dl className="mt-5 space-y-5">
            {FAQ.map((f) => (
              <div key={f.q} className="rounded-2xl border border-line bg-white p-5">
                <dt className="font-semibold text-ink">{f.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-ink-3">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-boss-gold px-6 py-3 text-base font-semibold text-black shadow-sm transition hover:brightness-105"
          >
            Start with {FREE_CREDITS} free credits
          </Link>
          <Link
            href="/guides"
            className="rounded-xl border border-line bg-white px-6 py-3 text-base font-medium text-ink transition hover:bg-slate-50"
          >
            Read the guides
          </Link>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
