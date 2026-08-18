import type { Metadata } from "next";
import Link from "next/link";
import { getPost } from "@/lib/blog/posts";
import { getServerT } from "@/lib/i18n/server";

const SLUG = "liondesk-shutdown-what-agents-should-do-next";
const SITE_URL = "https://closebossai.com";
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

/* Keys, not copy — a module-scope constant cannot hold a hook. */
const EVALUATION_STEPS: Array<{ title: string; body: string }> = [
  { title: "pages.liondeskShutdown.s1Title", body: "pages.liondeskShutdown.s1Body" },
  { title: "pages.liondeskShutdown.s2Title", body: "pages.liondeskShutdown.s2Body" },
  { title: "pages.liondeskShutdown.s3Title", body: "pages.liondeskShutdown.s3Body" },
  { title: "pages.liondeskShutdown.s4Title", body: "pages.liondeskShutdown.s4Body" },
  { title: "pages.liondeskShutdown.s5Title", body: "pages.liondeskShutdown.s5Body" },
];

export default async function LiondeskShutdownPost() {
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
        datePublished: post?.publishedAt ?? "2026-05-22",
        author: { "@type": "Person", name: post?.author ?? "Michael Ye" },
        publisher: {
          "@type": "Organization",
          name: "CloseBoss",
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/brand/closeboss/closeboss-icon-512.png`,
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
              text: "Solo agents should look for a CRM built around speed-to-lead — AI text-back within seconds, missed-call automation, and a workflow that doesn't require a team admin to operate. CloseBoss was designed specifically for solo agents and small teams who win on response time.",
            },
          },
          {
            "@type": "Question",
            name: "How do I export my data from LionDesk?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Export contacts and activity history as a CSV from LionDesk's Settings → Data section. Most modern CRMs — including CloseBoss — accept a duplicate-aware CSV import that maps standard fields automatically.",
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
        <nav aria-label={t("pages.articleChrome.breadcrumb", { ns: "dashboard" })} className="mb-6 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/" className="hover:text-slate-700 dark:hover:text-slate-200">{t("pages.articleChrome.home", { ns: "dashboard" })}</Link>
          <span className="mx-2">/</span>
          <Link href="/blog" className="hover:text-slate-700 dark:hover:text-slate-200">{t("pages.liondeskShutdown.blog", { ns: "dashboard" })}</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700 dark:text-slate-300">{t("pages.liondeskShutdown.crumb", { ns: "dashboard" })}</span>
        </nav>

        <header>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <span className="inline-flex items-center rounded-full bg-blue-600/10 px-2.5 py-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{t("pages.liondeskShutdown.category", { ns: "dashboard" })}</span>
            <span className="text-slate-500 dark:text-slate-400">
              {post?.readTime ?? "5 min"} read
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl dark:text-white">{t("pages.liondeskShutdown.h1", { ns: "dashboard" })}</h1>
          <p className="mt-4 text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">{t("pages.liondeskShutdown.subtitle", { ns: "dashboard" })}</p>
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
            May 22, 2026 · Michael Ye
          </p>
        </header>

        <div className="mt-10 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
          <p>{t("pages.liondeskShutdown.intro1", { ns: "dashboard" })}</p>
          <p>{t("pages.liondeskShutdown.intro2", { ns: "dashboard" })}</p>
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.liondeskShutdown.hardTruth", { ns: "dashboard" })}</h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>{t("pages.liondeskShutdown.hardTruthBody", { ns: "dashboard" })}</p>
            <p className="font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.speed", { ns: "dashboard" })}</p>
            <p>{t("pages.liondeskShutdown.neverClosed", { ns: "dashboard" })}</p>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-blue-100 bg-blue-50/50 p-6 md:p-8 dark:border-blue-900/40 dark:bg-blue-950/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">{t("pages.liondeskShutdown.theNumber", { ns: "dashboard" })}</p>
          <p className="mt-3 text-2xl font-semibold leading-snug text-slate-900 md:text-3xl dark:text-white">{t("pages.liondeskShutdown.fortySeven", { ns: "dashboard" })}</p>
          <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-300">{t("pages.liondeskShutdown.notTheBest", { ns: "dashboard" })}</p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.liondeskShutdown.smarterTitle", { ns: "dashboard" })}</h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>{t("pages.liondeskShutdown.smarterBody", { ns: "dashboard" })}</p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📞</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.m1", { ns: "dashboard" })}</span>{" "}{t("pages.liondeskShutdown.m1Tail", { ns: "dashboard" })}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">🌙</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.m2", { ns: "dashboard" })}</span>{" "}{t("pages.liondeskShutdown.m2Tail", { ns: "dashboard" })}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">🎯</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.m3", { ns: "dashboard" })}</span>{" "}{t("pages.liondeskShutdown.m3Tail", { ns: "dashboard" })}</span>
              </li>
            </ul>
            <p>{t("pages.liondeskShutdown.tableStakes", { ns: "dashboard" })}</p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.liondeskShutdown.checklistTitle", { ns: "dashboard" })}</h2>
          <p className="mt-3 text-base leading-7 text-slate-700 dark:text-slate-200">{t("pages.liondeskShutdown.checklistIntro", { ns: "dashboard" })}</p>
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
                    {t(step.title, { ns: "dashboard" })}
                  </p>
                  <p className="mt-1">{t(step.body, { ns: "dashboard" })}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.liondeskShutdown.whereWeFit", { ns: "dashboard" })}</h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>{t("pages.liondeskShutdown.transparent", { ns: "dashboard" })}{" "}
              <Link
                href="/"
                className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
              >
                CloseBoss
              </Link>{" "}{t("pages.liondeskShutdown.toClose", { ns: "dashboard" })}</p>
            <p>{t("pages.liondeskShutdown.worthCloserLook", { ns: "dashboard" })}</p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">⚡</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.f1", { ns: "dashboard" })}</span>{" "}{t("pages.liondeskShutdown.f1Tail", { ns: "dashboard" })}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📞</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.f2", { ns: "dashboard" })}</span>{" "}{t("pages.liondeskShutdown.f2Tail", { ns: "dashboard" })}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📥</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.f3", { ns: "dashboard" })}</span>{" "}{t("pages.liondeskShutdown.f3Tail", { ns: "dashboard" })}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">💸</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.f4", { ns: "dashboard" })}</span>{" "}{t("pages.liondeskShutdown.f4Tail", { ns: "dashboard" })}{" "}
                  <Link
                    href="/agent/compare"
                    className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                  >{t("pages.liondeskShutdown.comparisonPage", { ns: "dashboard" })}</Link>
                  .
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-8 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl dark:text-white">{t("pages.liondeskShutdown.tryTitle", { ns: "dashboard" })}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("pages.liondeskShutdown.tryBody", { ns: "dashboard" })}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >{t("pages.liondeskShutdown.startTrial", { ns: "dashboard" })}</Link>
            <Link
              href="/voice-ai-test-drive"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >{t("pages.liondeskShutdown.testDriveVoice", { ns: "dashboard" })}</Link>
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.articleChrome.faqLong", { ns: "dashboard" })}</h2>
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.q1", { ns: "dashboard" })}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("pages.liondeskShutdown.a1", { ns: "dashboard" })}</p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.q2", { ns: "dashboard" })}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("pages.liondeskShutdown.a2", { ns: "dashboard" })}{" "}
                <Link
                  href="/agent/compare"
                  className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                >{t("pages.liondeskShutdown.comparisonPage", { ns: "dashboard" })}</Link>
                .
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.q3", { ns: "dashboard" })}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("pages.liondeskShutdown.a3", { ns: "dashboard" })}</p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.q4", { ns: "dashboard" })}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("pages.liondeskShutdown.a4", { ns: "dashboard" })}</p>
            </div>
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{t("pages.liondeskShutdown.whichCrm", { ns: "dashboard" })}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("pages.liondeskShutdown.tellUs", { ns: "dashboard" })}{" "}
            <a
              href="https://www.linkedin.com/company/leadsmart-ai"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >{t("pages.liondeskShutdown.linkedin", { ns: "dashboard" })}</a>
            , or{" "}
            <Link
              href="/contact"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >{t("pages.liondeskShutdown.dropNote", { ns: "dashboard" })}</Link>
            .
          </p>
        </section>
      </article>
    </div>
  );
}
