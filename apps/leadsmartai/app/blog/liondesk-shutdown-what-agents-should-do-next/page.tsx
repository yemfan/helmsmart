import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getPost } from "@/lib/blog/posts";

const SLUG = "liondesk-shutdown-what-agents-should-do-next";
const SITE_URL = "https://realtybossai.com";
const TITLE = "LionDesk Is Shutting Down: What Solo Agents Should Do Next";
const DESCRIPTION =
  "LionDesk is winding down. Here's why a forced CRM migration is the best thing that could happen to your business — and how to pick a replacement built for speed.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "LionDesk shutting down",
    "LionDesk alternative",
    "LionDesk replacement",
    "real estate CRM",
    "speed to lead",
    "AI lead follow up",
    "solo agent CRM",
  ],
  alternates: { canonical: `/blog/${SLUG}` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `/blog/${SLUG}`,
    type: "article",
    publishedTime: "2026-05-22",
    authors: ["Michael Ye"],
    tags: ["LionDesk", "CRM migration", "Speed to lead", "Real estate AI"],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Why a forced CRM migration is actually an upgrade opportunity — and what to look for in a replacement built for solo agents.",
  },
};

const EVALUATION_STEPS: Array<{ title: string; body: ReactNode }> = [
  {
    title: "AI text-back in under 60 seconds",
    body: (
      <>
        Not &ldquo;email drip in 5 minutes.&rdquo; A real SMS reply
        that sounds human, fires while the lead is still on your
        site, and pulls the right context (property address, source,
        prior touches).
      </>
    ),
  },
  {
    title: "Missed-call recovery built in",
    body: (
      <>
        If someone calls and you can&apos;t pick up, an SMS should go
        out automatically. Voicemail is a death sentence in 2026.
      </>
    ),
  },
  {
    title: "Pricing that fits a solo P&L",
    body: (
      <>
        Most enterprise CRMs run $499–$1,500+ a month. As a solo
        agent, you should be in the double digits per month — not
        paying for a team-of-50 feature set you&apos;ll never touch.
      </>
    ),
  },
  {
    title: "Easy data import (and export)",
    body: (
      <>
        A duplicate-aware CSV import with a clean field mapping. And
        — equally important — clean export, so you&apos;re not locked
        into the next platform the way LionDesk users are locked into
        theirs.
      </>
    ),
  },
  {
    title: "Workflow you can run from your phone",
    body: (
      <>
        If the CRM only works from a desktop, you&apos;ll abandon it
        within a month. The actual job happens at open houses, in the
        car, between showings.
      </>
    ),
  },
];

export default function LiondeskShutdownPost() {
  const post = getPost(SLUG);
  const url = `${SITE_URL}/blog/${SLUG}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post?.title ?? TITLE,
        description: post?.description ?? DESCRIPTION,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        url,
        datePublished: post?.publishedAt ?? "2026-05-22",
        author: { "@type": "Person", name: post?.author ?? "Michael Ye" },
        publisher: {
          "@type": "Organization",
          name: "RealtorBoss",
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/brand/realtorboss/realtorboss-icon-512.png`,
          },
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "When is LionDesk shutting down?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "LionDesk has announced it is winding down its CRM. Existing customers should plan their migration now to avoid losing access to contacts, history, and active follow-up sequences.",
            },
          },
          {
            "@type": "Question",
            name: "What is the best LionDesk alternative for solo agents?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Solo agents should look for a CRM built around speed-to-lead — AI text-back within seconds, missed-call automation, and a workflow that doesn't require a team admin to operate. RealtorBoss was designed specifically for solo agents and small teams who win on response time.",
            },
          },
          {
            "@type": "Question",
            name: "How do I export my data from LionDesk?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Export contacts and activity history as a CSV from LionDesk's Settings → Data section. Most modern CRMs — including RealtorBoss — accept a duplicate-aware CSV import that maps standard fields automatically.",
            },
          },
          {
            "@type": "Question",
            name: "Why does response time matter so much?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Industry research consistently shows that roughly 47% of buyers and sellers end up working with the first agent who responds, not necessarily the most experienced. AI-powered text-back closes that gap to under a minute, 24/7.",
            },
          },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/" className="hover:text-slate-700 dark:hover:text-slate-200">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/blog" className="hover:text-slate-700 dark:hover:text-slate-200">
            Blog
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700 dark:text-slate-300">LionDesk shutdown</span>
        </nav>

        <header>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <span className="inline-flex items-center rounded-full bg-blue-600/10 px-2.5 py-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              Industry news
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {post?.readTime ?? "5 min"} read
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl dark:text-white">
            LionDesk Is Shutting Down: What Solo Agents Should Do Next
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            Migrating a CRM is a pain. It is also the best thing that
            could happen to your business — if you treat it as a
            forcing function to upgrade.
          </p>
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
            May 22, 2026 · Michael Ye
          </p>
        </header>

        <div className="mt-10 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
          <p>
            LionDesk is shutting down. If you&apos;re still using it,
            you need a plan — now. A lot of agents are scrambling, and
            I get it. Pulling contacts, drip campaigns, and call notes
            out of a CRM you&apos;ve lived in for years is real work.
          </p>
          <p>
            But honestly? This is the best thing that could happen to
            your business if you use it as a forcing function to
            actually upgrade — not just lateral-move to whichever tool
            looks most familiar.
          </p>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            The hard truth about most real estate CRMs
          </h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>
              Most CRMs were built for teams, brokerages, and
              enterprise accounts. Solo agents get shoehorned into a
              tool that&apos;s overkill in some places — roles,
              permissions, lead-router rules nobody owns — and
              completely missing the one thing that actually moves
              deals.
            </p>
            <p className="font-semibold text-slate-900 dark:text-white">
              Speed.
            </p>
            <p>
              That&apos;s the gap LionDesk never closed. Their pricing
              tier was right for solo agents, but the product was
              still a contact database with drips bolted on. In 2026
              that&apos;s not enough.
            </p>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-blue-100 bg-blue-50/50 p-6 md:p-8 dark:border-blue-900/40 dark:bg-blue-950/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            The number that runs every solo agent&apos;s business
          </p>
          <p className="mt-3 text-2xl font-semibold leading-snug text-slate-900 md:text-3xl dark:text-white">
            47% of leads go with the first agent who responds.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
            Not the best agent. Not the most experienced. The fastest
            one. If a lead waits more than five minutes for a reply,
            your odds of converting them drop off a cliff.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            What &ldquo;automating smarter&rdquo; actually looks like
          </h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>
              The agents winning right now aren&apos;t hustling harder.
              They&apos;re not making 200 calls a day or staying up
              until midnight to text back open-house leads. They&apos;re
              automating the moments that decide deals.
            </p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📞</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    When a lead calls during a showing,
                  </span>{" "}
                  an AI texts them back in seconds. By the time
                  you&apos;re back in the car, the conversation is
                  already started and qualified.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">🌙</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    When a new inquiry comes in at 11 p.m.,
                  </span>{" "}
                  it gets a personalized response before the lead has
                  even put their phone down.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">🎯</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    When a buyer goes quiet for two weeks,
                  </span>{" "}
                  the system spots it, sends a nudge with a fresh
                  listing match, and surfaces them back to the top of
                  your queue.
                </span>
              </li>
            </ul>
            <p>
              None of that is futuristic — it&apos;s table stakes for a
              modern CRM. And it&apos;s exactly what was missing for
              the LionDesk solo-agent user.
            </p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            A checklist for evaluating your next CRM
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-700 dark:text-slate-200">
            Don&apos;t pick a replacement based on which logo looks
            nicest. Pull up the demo, the trial, and the pricing page,
            and verify these specifically:
          </p>
          <ol className="mt-5 space-y-4">
            {EVALUATION_STEPS.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                >
                  {i + 1}
                </span>
                <div className="flex-1 text-base leading-7 text-slate-700 dark:text-slate-200">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {step.title}
                  </p>
                  <p className="mt-1">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            Where RealtorBoss fits in
          </h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>
              I&apos;ll be transparent: this is the gap we built{" "}
              <Link
                href="/"
                className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
              >
                RealtorBoss
              </Link>{" "}
              to close. Every leaving-LionDesk agent we&apos;ve talked
              to in the last few weeks has had the same shopping list
              — and it&apos;s the same list above.
            </p>
            <p>
              A few things worth a closer look if you&apos;re
              evaluating us alongside the bigger names:
            </p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">⚡</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    AI follow-up that responds in under a minute,
                    24/7.
                  </span>{" "}
                  Set a review policy once and walk away.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📞</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Missed-call text-back out of the box.
                  </span>{" "}
                  Forward your calls to your LeadSmart number and
                  every unanswered call triggers an SMS within a
                  minute.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📥</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Duplicate-aware CSV import.
                  </span>{" "}
                  Drop in your LionDesk export. We auto-map standard
                  fields and let you undo the entire batch within 24
                  hours if anything looks off.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">💸</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Solo-agent pricing.
                  </span>{" "}
                  We start at $49/mo — not $499. See the full feature
                  comparison vs. Follow Up Boss, kvCORE, Lofty, and
                  others on the{" "}
                  <Link
                    href="/agent/compare"
                    className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                  >
                    comparison page
                  </Link>
                  .
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-8 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl dark:text-white">
            Try it before you commit
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Send a test lead through RealtorBoss and watch the
            response fire. If it doesn&apos;t feel meaningfully faster
            than what you had in LionDesk, move on with a clear
            conscience.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Start 14-day free trial
            </Link>
            <Link
              href="/voice-ai-test-drive"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >
              Test-drive the voice AI
            </Link>
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            Frequently asked questions
          </h2>
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                When exactly is LionDesk shutting down?
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                LionDesk has announced a wind-down of its CRM product.
                Sunset timelines for tools like this typically run 60
                to 180 days, with read-only data export windows after
                that. Don&apos;t wait for the lights-out date — pull
                your contacts now while every feature still works.
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                What&apos;s the best LionDesk alternative for solo
                agents?
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Look for AI text-back, missed-call recovery, and
                pricing that fits a solo P&amp;L. RealtorBoss was
                designed for exactly this segment — see how it
                compares to Follow Up Boss, kvCORE, and Lofty on our{" "}
                <Link
                  href="/agent/compare"
                  className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                >
                  comparison page
                </Link>
                .
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                How do I export my data out of LionDesk?
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Inside LionDesk, go to Settings → Data and export
                contacts and activity history as CSV. Modern CRMs
                accept a duplicate-aware CSV import with auto-mapped
                standard fields, so you can be live on the new
                platform the same afternoon.
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Will I lose my drip campaigns?
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Drip-campaign logic doesn&apos;t port cleanly between
                CRMs, but the underlying ideas do. Most modern
                platforms ship prebuilt sequences for buyer leads,
                seller leads, and re-engagement that are stronger than
                what most agents had hand-built in LionDesk. Treat
                this as a chance to upgrade the copy, not just port
                it.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            What CRM are you moving to?
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            We&apos;d genuinely like to know what&apos;s on your
            shortlist. Reply on{" "}
            <a
              href="https://www.linkedin.com/company/leadsmart-ai"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              LinkedIn
            </a>
            , or{" "}
            <Link
              href="/contact"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              drop us a note
            </Link>
            .
          </p>
        </section>
      </article>
    </div>
  );
}
