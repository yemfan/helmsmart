import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getPost } from "@/lib/blog/posts";
import { getServerT } from "@/lib/i18n/server";

const SLUG = "your-crm-should-call-your-sphere-not-just-text-it";
const SITE_URL = "https://closebossai.com";
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

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/*
 * Bodies are functions of the translator, not JSX constants. A module-scope
 * constant cannot hold a hook, and these paragraphs carry inline emphasis that
 * would be lost if they collapsed to plain strings — so the emphasised
 * fragments keep their own keys and Chinese puts the stress where it belongs.
 */
const SECTIONS: Array<{ headingKey: string; body: (t: Translate) => ReactNode }> = [
  {
    headingKey: "pages.callYourSphere.h1Section",
    body: (t) => (
      <>
        {t("pages.callYourSphere.everyCrmEnds", { ns: "dashboard" })} <em>{t("pages.callYourSphere.conversationWord", { ns: "dashboard" })}</em>{" "}
        {t("pages.callYourSphere.endsTail", { ns: "dashboard" })}
      </>
    ),
  },
  {
    headingKey: "pages.callYourSphere.h2Section",
    body: (t) => (
      <>
        {t("pages.callYourSphere.actuallyCalls", { ns: "dashboard" })}{" "}
        <strong>{t("pages.callYourSphere.receptionist", { ns: "dashboard" })}</strong> {t("pages.callYourSphere.answersLive", { ns: "dashboard" })}{" "}
        <strong>{t("pages.callYourSphere.placesRealCalls", { ns: "dashboard" })}</strong>{t("pages.callYourSphere.outboundTail", { ns: "dashboard" })}
      </>
    ),
  },
  {
    headingKey: "pages.callYourSphere.h3Section",
    body: (t) => (
      <>
        {t("pages.callYourSphere.youreTheBoss", { ns: "dashboard" })}{" "}
        <strong>{t("pages.callYourSphere.bossAssistant", { ns: "dashboard" })}</strong> {t("pages.callYourSphere.figuresOut", { ns: "dashboard" })}
      </>
    ),
  },
  {
    headingKey: "pages.callYourSphere.h4Section",
    body: (t) => <>{t("pages.callYourSphere.sayExample", { ns: "dashboard" })}</>,
  },
];

export default async function CallYourSpherePost() {
  const t = await getServerT();
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
          name: "CloseBoss",
          logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/realtyboss/realtyboss-icon-512.png` },
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Does CloseBoss actually make phone calls, or just send texts?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Both. The AI Receptionist answers inbound calls live 24/7 and texts back missed calls, and the AI places real outbound voice calls to follow up with your sphere and leads — not just SMS like other CRMs.",
            },
          },
          {
            "@type": "Question",
            name: "How is CloseBoss different from other real estate CRMs?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Most CRMs stop at SMS and email drips and leave the work to you. CloseBoss is an AI team you command: it answers the phone, calls your sphere by real voice, and runs whole jobs — open houses, presentations, showings, closings — from one instruction, handing back finished reports.",
            },
          },
          {
            "@type": "Question",
            name: "What is the CloseBoss AI team?",
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
        <nav aria-label={t("pages.articleChrome.breadcrumb", { ns: "dashboard" })} className="mb-6 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/" className="hover:text-slate-700 dark:hover:text-slate-200">{t("pages.articleChrome.home", { ns: "dashboard" })}</Link>
          <span className="mx-2">/</span>
          <Link href="/blog" className="hover:text-slate-700 dark:hover:text-slate-200">{t("pages.callYourSphere.blog", { ns: "dashboard" })}</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700 dark:text-slate-300">{t("pages.callYourSphere.crumb", { ns: "dashboard" })}</span>
        </nav>

        <header>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <span className="inline-flex items-center rounded-full bg-blue-600/10 px-2.5 py-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{t("pages.callYourSphere.category", { ns: "dashboard" })}</span>
            <span className="text-slate-500 dark:text-slate-400">
              {post?.readTime ?? "5 min"} read
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl dark:text-white">
            {TITLE}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">{t("pages.callYourSphere.subtitle", { ns: "dashboard" })}</p>
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
            June 23, 2026 · Michael Ye
          </p>
        </header>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.headingKey}>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
                {t(s.headingKey, { ns: "dashboard" })}
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
                {s.body(t)}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-gradient-to-br from-[#0072ce] via-[#4F46E5] to-[#7c3aed] p-8 text-center text-white">
          <h2 className="text-2xl font-bold">{t("pages.callYourSphere.ctaTitle", { ns: "dashboard" })}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/90">{t("pages.callYourSphere.ctaBody", { ns: "dashboard" })}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/onboarding"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#0072ce] shadow-lg transition hover:bg-slate-50"
            >{t("pages.callYourSphere.hireTeam", { ns: "dashboard" })}</Link>
            <Link
              href="/features"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
            >{t("pages.callYourSphere.seeHow", { ns: "dashboard" })}</Link>
          </div>
        </div>
      </article>
    </div>
  );
}
