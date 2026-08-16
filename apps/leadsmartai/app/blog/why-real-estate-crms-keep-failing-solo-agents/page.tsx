import type { Metadata } from "next";
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

/*
 * Keys, not copy. A module-scope constant cannot hold a hook, so the vendor
 * teardown rendered English no matter what the reader had chosen — and the
 * teardown is the reason anyone opens this article.
 */
const TEARDOWNS: CrmTeardown[] = [
  {
    name: "LionDesk",
    positioning: "pages.crmProblems.lionPos",
    problem:
      "pages.crmProblems.lionProblem",
    bestFor: "pages.crmProblems.lionBest",
  },
  {
    name: "Follow Up Boss",
    positioning: "pages.crmProblems.fubPos",
    problem:
      "pages.crmProblems.fubProblem",
    bestFor: "pages.crmProblems.fubBest",
  },
  {
    name: "kvCORE",
    positioning: "pages.crmProblems.kvPos",
    problem:
      "pages.crmProblems.kvProblem",
    bestFor: "pages.crmProblems.kvBest",
  },
  {
    name: "Lofty (formerly Chime)",
    positioning: "pages.crmProblems.loftyPos",
    problem:
      "pages.crmProblems.loftyProblem",
    bestFor: "pages.crmProblems.loftyBest",
  },
  {
    name: "BoomTown",
    positioning: "pages.crmProblems.boomPos",
    problem:
      "pages.crmProblems.boomProblem",
    bestFor: "pages.crmProblems.boomBest",
  },
  {
    name: "Sierra Interactive",
    positioning: "pages.crmProblems.sierraPos",
    problem:
      "pages.crmProblems.sierraProblem",
    bestFor: "pages.crmProblems.sierraBest",
  },
];

const PILLARS: Array<{ title: string; body: string; href?: string }> = [
  { title: "pages.crmProblems.p1Title", body: "pages.crmProblems.p1Body", href: "/help/guides/ai-followup-setup" },
  { title: "pages.crmProblems.p2Title", body: "pages.crmProblems.p2Body", href: "/help/guides/missed-call-text-back" },
  { title: "pages.crmProblems.p3Title", body: "pages.crmProblems.p3Body" },
  { title: "pages.crmProblems.p4Title", body: "pages.crmProblems.p4Body", href: "/agent/pricing" },
  { title: "pages.crmProblems.p5Title", body: "pages.crmProblems.p5Body" },
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
          <Link href="/blog" className="hover:text-slate-700 dark:hover:text-slate-200">{t("pages.crmProblems.blog", { ns: "dashboard" })}</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700 dark:text-slate-300">{t("pages.crmProblems.crumbTitle", { ns: "dashboard" })}</span>
        </nav>

        <header>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <span className="inline-flex items-center rounded-full bg-blue-600/10 px-2.5 py-1 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">{t("pages.crmProblems.category", { ns: "dashboard" })}</span>
            <span className="text-slate-500 dark:text-slate-400">
              {post?.readTime ?? "8 min"} read
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl dark:text-white">{t("pages.crmProblems.h1", { ns: "dashboard" })}</h1>
          <p className="mt-3 text-sm font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">{t("pages.crmProblems.subtitle", { ns: "dashboard" })}</p>
          <p className="mt-5 text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">{t("pages.crmProblems.intro", { ns: "dashboard" })}</p>
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
            May 23, 2026 · Michael Ye
          </p>
        </header>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.crmProblems.meansTitle", { ns: "dashboard" })}</h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>{t("pages.crmProblems.meansP1", { ns: "dashboard" })}</p>
            <p>{t("pages.crmProblems.signalIs", { ns: "dashboard" })}{" "}
              <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.signalBody", { ns: "dashboard" })}</span>{" "}{t("pages.crmProblems.meansP2", { ns: "dashboard" })}</p>
            <p>{t("pages.crmProblems.meansP3", { ns: "dashboard" })}</p>
            <p>{t("pages.crmProblems.beforeYouSign", { ns: "dashboard" })}</p>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.crmProblems.teardownTitle", { ns: "dashboard" })}</h2>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("pages.crmProblems.teardownIntro", { ns: "dashboard" })}</p>
          <div className="mt-6 space-y-5">
            {TEARDOWNS.map((row) => (
              <div
                key={row.name}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 md:p-6"
              >
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {row.name}
                </h3>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t(row.positioning, { ns: "dashboard" })}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.theCatch", { ns: "dashboard" })}</span>{" "}
                  {t(row.problem, { ns: "dashboard" })}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.honestFit", { ns: "dashboard" })}</span>{" "}
                  {t(row.bestFor, { ns: "dashboard" })}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("pages.crmProblems.sideBySide", { ns: "dashboard" })}{" "}
            <Link
              href="/agent/compare"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >{t("pages.crmProblems.comparisonTable", { ns: "dashboard" })}</Link>
            .
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.crmProblems.patternTitle", { ns: "dashboard" })}</h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>{t("pages.crmProblems.patternIntro", { ns: "dashboard" })}</p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">🧩</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.neverUse", { ns: "dashboard" })}</span>{" "}{t("pages.crmProblems.neverUseTail", { ns: "dashboard" })}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📞</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.missingOne", { ns: "dashboard" })}</span>{" "}{t("pages.crmProblems.missingOneTail", { ns: "dashboard" })}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">💸</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.enterprisePrices", { ns: "dashboard" })}</span>{" "}
                  — anywhere from $499 to $1,500+ per month for a
                  feature set whose real audience is a 20-agent
                  brokerage.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">🏗️</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.lockedDesktop", { ns: "dashboard" })}</span>{" "}{t("pages.crmProblems.lockedDesktopTail", { ns: "dashboard" })}</span>
              </li>
            </ul>
            <p>{t("pages.crmProblems.exceptionWas", { ns: "dashboard" })}</p>
            <p>{t("pages.crmProblems.thatsTheGap", { ns: "dashboard" })}</p>
          </div>
        </section>

        <section className="mt-12 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-6 md:p-10 dark:border-blue-900/40 dark:from-blue-950/30 dark:via-slate-950 dark:to-slate-950">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">{t("pages.crmProblems.in2026", { ns: "dashboard" })}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl dark:text-white">{t("pages.crmProblems.fivePillars", { ns: "dashboard" })}</h2>
          <p className="mt-3 text-base leading-7 text-slate-700 dark:text-slate-200">{t("pages.crmProblems.fivePillarsIntro", { ns: "dashboard" })}</p>
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
                    {t(p.title, { ns: "dashboard" })}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">
                    {t(p.body, { ns: "dashboard" })}
                  </p>
                  {p.href ? (
                    <Link
                      href={p.href}
                      className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300"
                    >
                      {t("pages.crmProblems.readGuide", { ns: "dashboard" })}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.crmProblems.whereWeFit", { ns: "dashboard" })}</h2>
          <div className="mt-4 space-y-5 text-base leading-7 text-slate-700 dark:text-slate-200">
            <p>{t("pages.crmProblems.transparent", { ns: "dashboard" })}{" "}
              <Link
                href="/"
                className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
              >
                CloseBoss
              </Link>{" "}{t("pages.crmProblems.toClose", { ns: "dashboard" })}</p>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">⚡</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.aiFollowUp", { ns: "dashboard" })}</span>{" "}{t("pages.crmProblems.aiFollowUpTail", { ns: "dashboard" })}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📞</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.textBack", { ns: "dashboard" })}</span>{" "}{t("pages.crmProblems.textBackTail", { ns: "dashboard" })}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📱</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.mobileMirror", { ns: "dashboard" })}</span>{" "}{t("pages.crmProblems.mobileMirrorTail", { ns: "dashboard" })}</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">💸</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.pricingFrom", { ns: "dashboard" })}</span>{" "}{t("pages.crmProblems.pricingFromTail", { ns: "dashboard" })}{" "}
                  <Link
                    href="/agent/pricing"
                    className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                  >{t("pages.crmProblems.pricingPage", { ns: "dashboard" })}</Link>
                  .
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">📥</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.csvImport", { ns: "dashboard" })}</span>{" "}{t("pages.crmProblems.csvImportTail", { ns: "dashboard" })}{" "}
                  <Link
                    href="/help/guides/lead-import"
                    className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                  >{t("pages.crmProblems.importGuide", { ns: "dashboard" })}</Link>
                  .
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 text-lg">🎙️</span>
                <span>
                  <span className="font-semibold text-slate-900 dark:text-white">{t("pages.crmProblems.voiceAi", { ns: "dashboard" })}</span>{" "}{t("pages.crmProblems.voiceAiTail", { ns: "dashboard" })}{" "}
                  <Link
                    href="/voice-ai-test-drive"
                    className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                  >{t("pages.crmProblems.testDrive", { ns: "dashboard" })}</Link>{" "}{t("pages.crmProblems.inSixtySeconds", { ns: "dashboard" })}</span>
              </li>
            </ul>
            <p>{t("pages.crmProblems.thatsIt", { ns: "dashboard" })}</p>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 md:p-8 dark:border-slate-800 dark:bg-slate-900/40">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl dark:text-white">{t("pages.crmProblems.tryItTitle", { ns: "dashboard" })}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t("pages.crmProblems.tryItBody", { ns: "dashboard" })}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >{t("pages.crmProblems.startTrial", { ns: "dashboard" })}</Link>
            <Link
              href="/agent/compare"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >{t("pages.crmProblems.seeComparison", { ns: "dashboard" })}</Link>
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.crmProblems.furtherReading", { ns: "dashboard" })}</h2>
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
