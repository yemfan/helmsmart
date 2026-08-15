import Link from "next/link";
import { PublicNav } from "./PublicNav";
import { PublicFooter } from "./PublicFooter";
import { CREDIT_PACKS, SUBSCRIPTION_PLANS, formatPrice } from "@/lib/billing";
import { CREDIT_COST } from "@/lib/creditCosts";

// New accounts start with this many free credits (profiles.credits default,
// granted by the handle_new_user trigger). Surfaced here so visitors know they
// can start without paying.
const FREE_CREDITS = 40;

/**
 * Public marketing homepage for marketingbossai.com (logged-out visitors).
 *
 * Built in the CloseBoss marketing design *language* — sticky nav, eyebrow +
 * gradient-highlighted headings, rounded cards, a closing CTA band, columned
 * footer — but in MarketingBoss's own violet/gold light brand and product
 * story (AI image + video creative, pay-as-you-go, publish anywhere).
 *
 * Server component: fully static, SEO-friendly. The CTA points at /login
 * (which handles both sign-in and sign-up).
 */

const HOW_STEPS = [
  { n: "1", title: "Describe it", body: "Type a prompt — or drop in a product photo to riff on. Pick image or video." },
  { n: "2", title: "Generate", body: "fal.ai renders scroll-stopping, on-brand creative in seconds. Every render is saved to your gallery." },
  { n: "3", title: "Publish", body: "Post to Facebook, Instagram, Threads, LinkedIn, Pinterest, YouTube & TikTok — now or on a schedule." },
];

const FEATURES = [
  { title: "AI images", body: "Ads, product shots, thumbnails, and social graphics from a prompt or a reference photo." },
  { title: "Cinematic video", body: "Short vertical video and reels — text-to-video or bring a still to life." },
  { title: "UGC-style ads", body: "Emulate the viral, creator-style hooks that actually convert." },
  { title: "Publish anywhere", body: "One click to your connected socials — captions written for each platform." },
  { title: "Weekly autopilot", body: "Pick your days and let MarketingBoss research, create, and post on schedule." },
  { title: "Pay-as-you-go", body: "Buy credits, spend what you use. No subscription, no seats, cancel anytime." },
];

const PLATFORMS = ["Facebook", "Instagram", "Threads", "LinkedIn", "Pinterest", "YouTube", "TikTok"];

// Costs come from lib/creditCosts — the same table the generator charges
// against — so this block can't quote a price we no longer honour.
const PRICING = [
  { label: "Image", credits: `${CREDIT_COST.image} credit`, note: "each generation" },
  { label: "Edit", credits: `${CREDIT_COST.edit} credits`, note: "refine or restyle" },
  { label: "Video", credits: `${CREDIT_COST.video} credits`, note: "cinematic clip" },
];

export function MarketingLanding() {
  return (
    <div className="min-h-dvh">
      <PublicNav />

      <main id="main">
        {/* ── Hero ── */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-boss-violet">
              Cinematic marketing creative on demand
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-ink md:text-5xl">
              Scroll-stopping ads,{" "}
              <span className="bg-gradient-to-r from-boss-violet to-boss-gold bg-clip-text text-transparent">
                generated and posted
              </span>{" "}
              for you.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-3">
              MarketingBoss turns a prompt into on-brand images and video, writes the caption, and publishes to
              every channel — pay only for what you create.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-xl bg-boss-gold px-6 py-3 text-base font-semibold text-black shadow-sm transition hover:brightness-105"
              >
                Start creating free
              </Link>
              <a
                href="#how"
                className="rounded-xl border border-line bg-white px-6 py-3 text-base font-medium text-ink transition hover:bg-slate-50"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-xs text-ink-3">
              {FREE_CREDITS} free credits to start · no card required · no subscription
            </p>
          </div>

          {/* Studio mock — pure CSS, no external assets */}
          <div className="rounded-3xl border border-line bg-white p-4 shadow-xl shadow-boss-violet/5">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-slate-50 px-3 py-2.5 text-sm text-ink-3">
              <span className="text-boss-violet">✦</span>
              <span className="truncate">“A sunlit hero shot of our new sneaker, cinematic, 9:16”</span>
              <span className="ml-auto rounded-md bg-boss-gold px-2 py-1 text-[11px] font-semibold text-black">Generate</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                "from-violet-200 to-violet-300",
                "from-amber-200 to-amber-300",
                "from-sky-200 to-indigo-200",
                "from-rose-200 to-amber-200",
              ].map((g, i) => (
                <div
                  key={i}
                  className={`relative aspect-[4/5] overflow-hidden rounded-xl bg-gradient-to-br ${g}`}
                >
                  {i === 2 && (
                    <span className="absolute inset-0 grid place-items-center text-2xl text-white/90">▶</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-ink-3">
              <span>4 renders saved to your gallery</span>
              <span className="rounded-full bg-boss-violet/10 px-2 py-0.5 font-semibold text-boss-violet">Ready to post</span>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how" className="border-t border-line/80 bg-white/50">
          <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-boss-violet">How it works</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink md:text-4xl">
              From idea to posted in three steps.
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {HOW_STEPS.map((s) => (
                <div key={s.n} className="rounded-2xl border border-line bg-white p-6">
                  <span className="grid size-9 place-items-center rounded-full bg-boss-violet text-sm font-bold text-white">
                    {s.n}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── What you can make ── */}
        <section id="make" className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-boss-violet">What you can make</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink md:text-4xl">
            One studio for every piece of creative.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-white p-6 transition hover:border-boss-violet/40">
                <h3 className="text-base font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{f.body}</p>
              </div>
            ))}
          </div>

          {/* Platforms strip */}
          <div className="mt-10 rounded-2xl border border-line bg-white/70 p-5">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">Publish to</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {PLATFORMS.map((p) => (
                <span key={p} className="rounded-full border border-line bg-white px-3 py-1 text-sm font-medium text-ink-3">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="border-t border-line/80 bg-white/50">
          <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-boss-violet">Pricing</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink md:text-4xl">
              Start free. Pay for what you create.
            </h2>
            <p className="mt-3 max-w-xl text-ink-3">
              Every account starts with {FREE_CREDITS} free credits — no card. Then pick a monthly plan for credits at
              the best rate, or top up one-time as you go. Every render is saved to your gallery.
            </p>

            {/* Monthly plans */}
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {SUBSCRIPTION_PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
                    plan.popular ? "border-boss-violet ring-1 ring-boss-violet" : "border-line"
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-2.5 left-6 rounded-full bg-boss-violet px-2 py-0.5 text-[10px] font-semibold text-white">
                      Most popular
                    </span>
                  )}
                  <p className="text-sm font-semibold text-ink">{plan.name}</p>
                  <p className="mt-2 text-3xl font-bold text-ink">
                    {formatPrice(plan.priceCents)}
                    <span className="text-base font-medium text-ink-3">/mo</span>
                  </p>
                  <p className="mt-1 text-sm text-ink-3">{plan.creditsPerMonth.toLocaleString()} credits / month</p>
                  <p className="mt-3 flex-1 text-xs text-ink-3">{plan.blurb}</p>
                  <Link
                    href="/login"
                    className="mt-4 rounded-xl bg-boss-violet px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-boss-violet-600"
                  >
                    Choose {plan.name}
                  </Link>
                </div>
              ))}
            </div>

            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">Or start free / top up</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Free tier */}
              <div className="flex flex-col rounded-2xl border border-line bg-white p-6">
                <p className="text-sm font-semibold text-ink">Free</p>
                <p className="mt-2 text-3xl font-bold text-ink">$0</p>
                <p className="mt-1 text-sm text-ink-3">{FREE_CREDITS} credits to start</p>
                <p className="mt-3 flex-1 text-xs text-ink-3">
                  ~{FREE_CREDITS} images or {Math.floor(FREE_CREDITS / 20)} videos. No card required.
                </p>
                <Link
                  href="/login"
                  className="mt-4 rounded-xl border border-boss-violet/30 bg-white px-4 py-2 text-center text-sm font-semibold text-boss-violet transition hover:bg-boss-violet/5"
                >
                  Start free
                </Link>
              </div>

              {/* Credit packs */}
              {CREDIT_PACKS.map((pack) => (
                <div
                  key={pack.id}
                  className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
                    pack.popular ? "border-boss-violet ring-1 ring-boss-violet" : "border-line"
                  }`}
                >
                  {pack.popular && (
                    <span className="absolute -top-2.5 left-6 rounded-full bg-boss-violet px-2 py-0.5 text-[10px] font-semibold text-white">
                      Best value
                    </span>
                  )}
                  <p className="text-sm font-semibold text-ink">{pack.name}</p>
                  <p className="mt-2 text-3xl font-bold text-ink">{formatPrice(pack.priceCents)}</p>
                  <p className="mt-1 text-sm text-ink-3">{pack.credits.toLocaleString()} credits</p>
                  <p className="mt-3 flex-1 text-xs text-ink-3">{pack.blurb}</p>
                  <Link
                    href="/login"
                    className="mt-4 rounded-xl bg-boss-gold px-4 py-2 text-center text-sm font-semibold text-black transition hover:brightness-105"
                  >
                    Get {pack.name}
                  </Link>
                </div>
              ))}
            </div>

            {/* What a credit buys */}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-ink-3">
              <span className="font-semibold text-ink">What a credit buys:</span>
              {PRICING.map((p) => (
                <span key={p.label}>
                  {p.label} = {p.credits}
                </span>
              ))}
              <span>· Credits never expire.</span>
            </div>
          </div>
        </section>

        {/* ── Closing CTA band ── */}
        <section className="px-5 pb-8 pt-16">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-boss-violet to-boss-violet-600 px-6 py-12 text-center shadow-xl md:py-16">
            <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
              Make your next post in a minute.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-violet-100">
              Start free — describe what you want, and let MarketingBoss create and publish it.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-xl bg-boss-gold px-7 py-3 text-base font-semibold text-black shadow-lg transition hover:brightness-105"
            >
              Start creating free
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
