import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getPost } from "@/lib/blog/posts";
import { getServerT } from "@/lib/i18n/server";

const SLUG = "why-real-estate-crms-keep-failing-solo-agents";
const SITE_URL = "https://closebossai.com";
const TITLE =
  "Why Real Estate CRMs Keep Failing Solo Agents (and What LionDesk's Shutdown Reveals)";
const DESCRIPTION =
  "LionDesk's shutdown isn't a one-off — it's the symptom of a CRM market that was never built for solo agents. A breakdown of the real problems with Follow Up Boss, kvCORE, Lofty, BoomTown, and Sierra, and what a CRM should look like in 2026.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "real estate CRM problems",
    "best CRM for solo agents",
    "Follow Up Boss problems",
    "kvCORE problems",
    "Lofty CRM review",
    "BoomTown CRM",
    "Sierra Interactive",
    "LionDesk shutdown",
    "real estate AI CRM",
    "speed to lead",
  ],
  alternates: { canonical: `/blog/${SLUG}` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `/blog/${SLUG}`,
    type: "article",
    publishedTime: "2026-05-23",
    authors: ["Michael Ye"],
    tags: ["CRM", "Real estate technology", "Solo agents", "AI"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Why Real Estate CRMs Keep Failing Solo Agents",
    description:
      "Inside the CRM industry's structural problem: enterprise tools sold to solo agents at solo-agent prices.",
  },
};

type CrmTeardown = {
  name: string;
  positioning: string;
  problem: string;
  bestFor: string;
};

const TEARDOWNS: CrmTeardown[] = [
  {
    name: "LionDesk",
    positioning: "Affordable solo-agent CRM ($25–$83 / mo).",
    problem:
      "Right price point, wrong era. Drips bolted onto a 2010-era contact database. No real AI follow-up, no native missed-call recovery, and now — shutting down. Existing users have weeks to migrate.",
    bestFor: "Nobody, going forward.",
  },
  {
    name: "Follow Up Boss",
    positioning: "Power-team CRM with a great phone dialer ($69–$1,000+ / mo).",
    problem:
      "Built around a team of inside sales agents (ISAs) dialing a lead pool — not a solo agent juggling showings, calls, and texts from their phone. AI is layered in, not native. Costs balloon once you turn on the features that actually matter.",
    bestFor: "Mid-size teams with a dedicated ISA.",
  },
  {
    name: "kvCORE",
    positioning: "All-in-one IDX website + CRM + dialer ($499+ / mo, often brokerage-paid).",
    problem:
      "Comprehensive, complex, and built for brokerages. Onboarding takes weeks, the lead-router rules are inscrutable, and the per-seat pricing punishes solo operators. The AI assistant (Alex) ships off-brand SMS templates that prospects flag as spam.",
    bestFor: "Brokerages funding 50+ agents.",
  },
  {
    name: "Lofty (formerly Chime)",
    positioning: "AI-forward CRM with built-in CMS + ads ($499+ / mo).",
    problem:
      "Strong marketing site, mediocre product execution. Lead-source attribution is unreliable; the AI text-back works in demos but has long lag in production. Same enterprise pricing as kvCORE without the install base.",
    bestFor: "Teams that want one vendor for ads + CRM and don't mind paying enterprise rates.",
  },
  {
    name: "BoomTown",
    positioning: "High-touch lead-conversion platform ($1,500+ / mo).",
    problem:
      "The Cadillac of the category — and priced like one. Includes a managed success program because the product is too complex to self-serve. Designed for a brokerage hiring 5+ new agents a quarter, not a solo agent running their own book.",
    bestFor: "Top-tier teams with a dedicated CRM admin.",
  },
  {
    name: "Sierra Interactive",
    positioning: "IDX site + CRM with a strong investor + commercial slant ($500+ / mo).",
    problem:
      "Best-in-class IDX, weakest mobile experience in the category. SMS automation requires third-party integrations. Built before AI follow-up was table stakes, and the retrofit shows.",
    bestFor: "Investor-focused teams whose lead flow comes through the IDX site.",
  },
];

const PILLARS: Array<{ title: string; body: ReactNode; href?: string }> = [
  {
    title: "Speed first, everything else second",
    body: (
      <>
        Response time is the single biggest predictor of whether a lead
        becomes a client. The CRM should fire a real, personalized
        response in under a minute — at 11 p.m., during a showing, on
        Sunday. Nothing else matters more.
      </>
    ),
    href: "/help/guides/ai-followup-setup",
  },
  {
    title: "Missed-call recovery as default",
    body: (
      <>
        Voicemail is a death sentence in 2026. The moment a call goes
        unanswered, an SMS should fire. This shouldn&apos;t be a
        configuration flag buried in settings — it should be on out of
        the box.
      </>
    ),
    href: "/help/guides/missed-call-text-back",
  },
  {
    title: "Workflow that lives on your phone",
    body: (
      <>
        The actual job happens between showings. If the CRM is
        desktop-first, you&apos;ll abandon it inside a month. Inbox,
        notes, deal updates, and AI drafts have to be one tap away
        from whatever you&apos;re doing.
      </>
    ),
  },
  {
    title: "Pricing that fits a solo P&L",
    body: (
      <>
        A solo agent shouldn&apos;t pay enterprise rates for features
        only a brokerage uses. Real solo-agent pricing starts in the
        double digits per month, with the AI and missed-call features
        included — not as a premium add-on.
      </>
    ),
    href: "/agent/pricing",
  },
  {
    title: "Data you actually own",
    body: (
      <>
        Clean CSV export should be one click. If you decide tomorrow
        that we&apos;re not the right fit, you should be able to leave
        with your full history — contacts, conversations, notes — in
        an hour.
      </>
    ),
  },
];

export default async function CrmProblemsPost() {
  const t = await getServerT();
  const post = getPost(SLUG);
  const url = `${SITE_URL}/blog/${SLUG}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post?.title ?? TITLE,
    description: post?.description ?? DESCRIPTION,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    datePublished: post?.publishedAt ?? "2026-05-23",
    author: { "@type": "Person", name: post?.author ?? "Michael Ye" },
    publisher: {
      "@type": "Organization",
      name: "CloseBoss",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/brand/realtyboss/realtyboss-icon-512.png`,
      },
    },
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <nav aria-label={t("pages.articleChrome.breadcrumb", { ns: "dashboard" })} className="mb-6 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/" className="hover:text-slate-700 dark:hover:text-slate-200">{t("pages.articleChrome.home", { ns: "dashboard" })}</Link>
          <span className="mx-2">/</span>
          <Link href="/blog" className="hover:text-slate-700 dark:hover:text-slate-200">
            Blog
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700 dark:text-slate-300">
            Why CRMs keep failing solo agents
          </span>
        </nav>

        <header>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <span className="inline-flex items-center rounded-full bg-blue-600/10 px-2.5 py-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              AI &amp; Automation
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {post?.readTime ?? "8 min"} read
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl dark:text-white">
            Why Real Estate CRMs Keep Failing Solo Agents
          </h1>
          <p className="mt-3 text-sm font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">
            And what LionDesk&apos;s shutdown reveals about the whole
            category
          </p>
          <p className="mt-5 text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            The CRM market has a structural problem. Enterprise tools
            sold to solo agents at solo-agent prices, or solo-agent
            tools sold at 2015 technology. LionDesk just hit the end
            of that road. Here&apos;s the rest of the field, the
            issues nobody on a sales call will tell you about, and
            what a CRM should actually look like in 2026.
          </p>
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
            May 23, 2026 · Michael Ye
          </p>
        </header>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            What LionDesk&apos;s shutdown actually means
          </h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>
              LionDesk wasn&apos;t a fly-by-night vendor. It was the
              default CRM recommendation for solo agents for nearly a
              decade — affordable, simple enough to learn, and broad
              enough to cover the basics. When a product that
              well-positioned shuts down, it isn&apos;t a product
              failure. It&apos;s a market signal.
            </p>
            <p>
              The signal is this:{" "}
              <span className="font-semibold text-slate-900 dark:text-white">
                a CRM that ships 2015 technology can&apos;t survive a
                market where 47% of leads go with the first agent who
                responds.
              </span>{" "}
              Drip campaigns and contact databases used to be the
              product. Now they&apos;re a feature checkbox inside a
              product whose real job is automated response, not
              storage.
            </p>
            <p>
              If LionDesk had ever shipped real AI follow-up,
              missed-call text-back, and a mobile workflow that
              didn&apos;t feel like an afterthought, this post
              wouldn&apos;t exist. Instead, every solo agent on the
              platform is now scrambling — and every other CRM in the
              category is using the moment to land-grab.
            </p>
            <p>
              Before you sign with one of them, here&apos;s what
              you&apos;re actually buying.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            The teardown: what each major CRM is really for
          </h2>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Direct, no-marketing-spin breakdown. The pricing reflects
            published 2026 rates; what you actually pay depends on
            seat count and add-ons.
          </p>
          <div className="mt-6 space-y-5">
            {TEARDOWNS.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6"
              >
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t.name}
                </h3>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t.positioning}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    The catch:
                  </span>{" "}
                  {t.problem}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Honest fit:
                  </span>{" "}
                  {t.bestFor}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-6 text-slate-600 dark:text-slate-300">
            For a side-by-side feature comparison across all of these
            (including CloseBoss), see the full{" "}
            <Link
              href="/agent/compare"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              comparison table
            </Link>
            .
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            The pattern: enterprise tools sold downmarket
          </h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>
              Look at the list. With one exception, every major CRM
              in real estate was originally built for teams or
              brokerages, then repackaged for solo agents at the same
              feature set and a slightly trimmed price. Solo agents
              get:
            </p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">🧩</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Features they&apos;ll never use,
                  </span>{" "}
                  like lead-router rules, multi-source attribution
                  splits, ISA assignment queues, and seat-based
                  permission matrices.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📞</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Missing the one feature that actually wins deals
                    —
                  </span>{" "}
                  sub-minute, personalized AI response on every
                  channel, 24/7. When it&apos;s there, it&apos;s
                  usually a premium add-on or feels bolted on rather
                  than native.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">💸</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Paying enterprise prices for it
                  </span>{" "}
                  — anywhere from $499 to $1,500+ per month for a
                  feature set whose real audience is a 20-agent
                  brokerage.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">🏗️</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Locked into a desktop workflow
                  </span>{" "}
                  when the actual job happens on a phone, at an open
                  house, between showings.
                </span>
              </li>
            </ul>
            <p>
              The exception was LionDesk — built actually for solo
              agents, priced for them — but stuck on the old
              technology stack. When the AI wave hit, they
              couldn&apos;t catch up.
            </p>
            <p>
              That&apos;s the gap.
            </p>
          </div>
        </section>

        <section className="mt-12 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-6 md:p-10 dark:border-blue-900/40 dark:from-blue-950/30 dark:via-slate-950 dark:to-slate-950">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            What a CRM should look like in 2026
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl dark:text-white">
            Five pillars, not fifty features
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-700 dark:text-slate-200">
            Most CRM feature lists run 200+ items. That&apos;s a
            symptom of trying to be everything to everyone. A CRM
            built for solo agents in 2026 only needs five things to
            work well:
          </p>
          <ul className="mt-6 space-y-5">
            {PILLARS.map((p, i) => (
              <li key={p.title} className="flex gap-4">
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white"
                >
                  {i + 1}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    {p.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">
                    {p.body}
                  </p>
                  {p.href ? (
                    <Link
                      href={p.href}
                      className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
                    >
                      Read the guide →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            Where CloseBoss fits
          </h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>
              I&apos;ll be transparent: this is the gap we built{" "}
              <Link
                href="/"
                className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
              >
                CloseBoss
              </Link>{" "}
              to close. We start with the five pillars above and add
              only what genuinely earns its place.
            </p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">⚡</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    AI follow-up in under a minute,
                  </span>{" "}
                  with a Review Policy you set once. Auto-send for
                  full hands-off, or Require approval if you want
                  every draft past your eyes first. Out of the box on
                  every plan.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📞</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Missed-call text-back on by default,
                  </span>{" "}
                  not buried behind a paywall.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📱</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Mobile workflow that mirrors the desktop one,
                  </span>{" "}
                  not a stripped-down companion app. Inbox, deals,
                  drafts, calendar — same surface, one tap away.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">💸</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Solo-agent pricing starting at $79/mo,
                  </span>{" "}
                  not $499. See the full ladder on the{" "}
                  <Link
                    href="/agent/pricing"
                    className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                  >
                    pricing page
                  </Link>
                  .
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📥</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Duplicate-aware CSV import, undo-able for 24
                    hours.
                  </span>{" "}
                  Get your data in (or out) in an afternoon. See the{" "}
                  <Link
                    href="/help/guides/lead-import"
                    className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                  >
                    import guide
                  </Link>
                  .
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">🎙️</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Voice AI that answers inbound calls,
                  </span>{" "}
                  qualifies the caller, books a callback, and updates
                  the CRM — without you lifting a finger. You can{" "}
                  <Link
                    href="/voice-ai-test-drive"
                    className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                  >
                    test-drive it
                  </Link>{" "}
                  in 60 seconds.
                </span>
              </li>
            </ul>
            <p>
              That&apos;s it. No 60-page feature matrix. No success
              manager required. No annual contract.
            </p>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-8 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl dark:text-white">
            Don&apos;t take my word for it — try it
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Send a test lead through CloseBoss and clock the
            response. If sub-minute AI follow-up + missed-call
            text-back doesn&apos;t feel meaningfully better than your
            current setup, move on with a clear conscience.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Start 14-day free trial
            </Link>
            <Link
              href="/agent/compare"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >
              See full comparison
            </Link>
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            Further reading
          </h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <Link
                href="/blog/liondesk-shutdown-what-agents-should-do-next"
                className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
              >
                LionDesk Is Shutting Down: What Solo Agents Should Do
                Next →
              </Link>
            </li>
            <li>
              <Link
                href="/agent/compare"
                className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
              >
                CloseBoss vs. the rest — full feature comparison →
              </Link>
            </li>
            <li>
              <Link
                href="/help"
                className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
              >
                Help center — every how-to guide for CloseBoss →
              </Link>
            </li>
          </ul>
        </section>
      </article>
    </div>
  );
}
