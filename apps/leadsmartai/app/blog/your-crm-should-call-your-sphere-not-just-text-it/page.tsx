import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getPost } from "@/lib/blog/posts";

const SLUG = "your-crm-should-call-your-sphere-not-just-text-it";
const SITE_URL = "https://realtybossai.com";
const TITLE = "Your CRM Should Call Your Sphere — Not Just Text It";
const DESCRIPTION =
  "Every CRM sends SMS and email drips. None of them pick up the phone. Here's why outbound AI voice calls to your sphere — plus an AI team you command from one instruction — is the real upgrade for 2026.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "AI voice calls real estate",
    "outbound AI calling",
    "AI real estate team",
    "AI receptionist real estate",
    "sphere follow up",
    "real estate CRM",
    "missed call text back",
  ],
  alternates: { canonical: `/blog/${SLUG}` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `/blog/${SLUG}`,
    type: "article",
    publishedTime: "2026-06-23",
    authors: ["Michael Ye"],
    tags: ["AI voice", "Real estate AI", "Sphere of influence", "CRM"],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Texting isn't following up. Why your AI should call your sphere — and run the whole job from one command.",
  },
};

const SECTIONS: Array<{ heading: string; body: ReactNode }> = [
  {
    heading: "Texting isn't following up",
    body: (
      <>
        Every CRM on the market ends at the same place: an SMS sequence and an
        email drip. They&apos;ll &ldquo;nurture&rdquo; your sphere with a happy
        birthday text and a monthly newsletter. But the deal goes to the agent
        who has the <em>conversation</em> — and conversations happen on the
        phone. The problem was never that you didn&apos;t care; it&apos;s that
        calling 300 past clients by hand is impossible, so it never happens.
      </>
    ),
  },
  {
    heading: "So your AI picks up the phone — both ways",
    body: (
      <>
        RealtyBoss is the CRM that actually calls. Inbound, your{" "}
        <strong>AI Receptionist</strong> answers every call live, 24/7,
        qualifies the caller, books the appointment, and texts back the second a
        call goes unanswered. Outbound — and this is the part no other CRM does
        — it <strong>places real voice calls to your sphere and leads</strong>:
        check-ins, just-listed updates, price-drop alerts, follow-up. In a
        natural voice, from your number, logged to the contact automatically.
      </>
    ),
  },
  {
    heading: "It's not a tool you operate — it's a team you command",
    body: (
      <>
        You&apos;re the boss. You give one instruction to your{" "}
        <strong>Boss Assistant</strong> and it figures out who handles it and
        puts the team to work: the Receptionist on the phones, the Sales
        Assistant on follow-up, Marketing on the pipeline, the Transaction
        Assistant coordinating the deal, the Accountant on the books. You
        finally own a team — without the payroll.
      </>
    ),
  },
  {
    heading: "One command, the whole job — with the artifacts to show for it",
    body: (
      <>
        Say &ldquo;set up Saturday&apos;s open house,&rdquo; &ldquo;build a
        seller presentation for 123 Main St,&rdquo; or &ldquo;find and show
        homes to the Garcias,&rdquo; and the team does the research and every
        step — then hands you finished deliverables: an AI CMA, a branded
        listing presentation, a Property Deep Report with affordability and
        investment ROI, a curated buyer lineup, a net-to-seller sheet. You
        review and send.
      </>
    ),
  },
];

export default function CallYourSpherePost() {
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
        datePublished: post?.publishedAt ?? "2026-06-23",
        author: { "@type": "Person", name: post?.author ?? "Michael Ye" },
        publisher: {
          "@type": "Organization",
          name: "RealtyBoss",
          logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/realtyboss/realtyboss-icon-512.png` },
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Does RealtyBoss actually make phone calls, or just send texts?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Both. The AI Receptionist answers inbound calls live 24/7 and texts back missed calls, and the AI places real outbound voice calls to follow up with your sphere and leads — not just SMS like other CRMs.",
            },
          },
          {
            "@type": "Question",
            name: "How is RealtyBoss different from other real estate CRMs?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Most CRMs stop at SMS and email drips and leave the work to you. RealtyBoss is an AI team you command: it answers the phone, calls your sphere by real voice, and runs whole jobs — open houses, presentations, showings, closings — from one instruction, handing back finished reports.",
            },
          },
          {
            "@type": "Question",
            name: "What is the RealtyBoss AI team?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "You give one command to the Boss Assistant, which delegates to the team: an AI Receptionist (calls), Sales Assistant (follow-up), Marketing Assistant (pipeline), Transaction Assistant (coordination), and Accountant (books).",
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
          <span className="text-slate-700 dark:text-slate-300">Call your sphere</span>
        </nav>

        <header>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <span className="inline-flex items-center rounded-full bg-blue-600/10 px-2.5 py-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              AI &amp; automation
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {post?.readTime ?? "5 min"} read
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl dark:text-white">
            {TITLE}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            Agents lose deals to whoever picks up the phone first. So why does
            every CRM stop at a text message?
          </p>
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
            June 23, 2026 · Michael Ye
          </p>
        </header>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
                {s.heading}
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                {s.body}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-gradient-to-br from-[#0072ce] via-[#4F46E5] to-[#7c3aed] p-8 text-center text-white">
          <h2 className="text-2xl font-bold">Stop texting. Start closing.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/90">
            Put an AI team to work — one that answers the phone and calls your
            sphere. You give the order; they do the rest.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/onboarding"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#0072ce] shadow-lg transition hover:bg-slate-50"
            >
              Hire your AI team
            </Link>
            <Link
              href="/features"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              See how it works
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
