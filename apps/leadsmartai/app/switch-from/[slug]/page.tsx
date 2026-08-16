import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Download,
  Sparkles,
} from "lucide-react";
import { getSwitchSource, SWITCH_SOURCES } from "@/lib/marketing/switch-from";
import { getServerT } from "@/lib/i18n/server";

const SITE_URL = "https://closebossai.com";

type RouteParams = { slug: string };

export function generateStaticParams(): RouteParams[] {
  return SWITCH_SOURCES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const source = getSwitchSource(slug);
  if (!source) {
    return { title: "Page not found — CloseBoss" };
  }
  const title = `Switch from ${source.name} to CloseBoss`;
  return {
    title,
    description: source.heroSubhead,
    keywords: [
      `${source.name} alternative`,
      `${source.name} replacement`,
      `switch from ${source.name}`,
      "real estate CRM migration",
      "CloseBoss",
    ],
    alternates: { canonical: `/switch-from/${source.slug}` },
    openGraph: {
      title,
      description: source.heroSubhead,
      url: `/switch-from/${source.slug}`,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: source.heroSubhead,
    },
  };
}

export default async function SwitchFromPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const t = await getServerT();
  const { slug } = await params;
  const source = getSwitchSource(slug);
  if (!source) notFound();

  const url = `${SITE_URL}/switch-from/${source.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: `Switch from ${source.name} to CloseBoss`,
        url,
        description: source.heroSubhead,
      },
      {
        "@type": "HowTo",
        name: `How to migrate from ${source.name} to CloseBoss`,
        description: `Step-by-step migration from ${source.name} to CloseBoss — export contacts, import to LeadSmart, optionally use concierge migration.`,
        totalTime: "PT30M",
        step: source.migrationSteps.map((text, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          text: text.replace(/<SOURCE>/g, source.name),
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: source.faq.map((entry) => ({
          "@type": "Question",
          name: entry.q,
          acceptedAnswer: { "@type": "Answer", text: entry.a },
        })),
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

      <article className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
        <nav aria-label={t("pages.articleChrome.breadcrumb", { ns: "dashboard" })} className="mb-6 text-xs text-slate-500 dark:text-slate-400">
          <Link href="/" className="hover:text-slate-700 dark:hover:text-slate-200">{t("pages.articleChrome.home", { ns: "dashboard" })}</Link>
          <span className="mx-2">/</span>
          <Link href="/switch-from" className="hover:text-slate-700 dark:hover:text-slate-200">
            Switch from
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700 dark:text-slate-300">{source.name}</span>
        </nav>

        {source.urgencyBanner ? (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
            <AlertTriangle
              aria-hidden
              className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <p className="text-sm leading-6 text-amber-800 dark:text-amber-200">
              {source.urgencyBanner}
            </p>
          </div>
        ) : null}

        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
            CRM Migration · {source.name} → CloseBoss
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl dark:text-white">
            {source.heroHeadline}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            {source.heroSubhead}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Start free trial · 14 days
            </Link>
            <a
              href="#concierge"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >
              We&apos;ll migrate for you →
            </a>
          </div>
          {source.companionPost ? (
            <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
              Related context →{" "}
              <Link
                href={source.companionPost.href}
                className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
              >
                {source.companionPost.label}
              </Link>
            </p>
          ) : null}
        </header>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            Why agents are leaving {source.name}
          </h2>
          <ul className="mt-5 space-y-4">
            {source.painPoints.map((point) => (
              <li
                key={point.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {point.title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {point.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            Where LeadSmart wins
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {source.name}: {source.priceRange} · CloseBoss: $79 / mo starting · See the full table on the{" "}
            <Link
              href="/agent/compare"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              comparison page
            </Link>
            .
          </p>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Feature</th>
                  <th className="px-4 py-3">{source.name}</th>
                  <th className="px-4 py-3 text-blue-700 dark:text-blue-300">CloseBoss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
                {source.comparisonWins.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {row.feature}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {row.them}
                    </td>
                    <td className="px-4 py-3 font-semibold text-blue-700 dark:text-blue-300">
                      {row.us}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            How to migrate yourself — in under an hour
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Most agents migrate in a single sitting. If you&apos;d rather have
            us do it for you,{" "}
            <a
              href="#concierge"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              skip to concierge migration
            </a>
            .
          </p>
          <ol className="mt-6 space-y-4">
            {source.migrationSteps.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                >
                  {i + 1}
                </span>
                <p className="flex-1 text-base leading-7 text-slate-700 dark:text-slate-200">
                  {step.replace(/<SOURCE>/g, source.name)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="concierge"
          className="mt-16 scroll-mt-24 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-6 md:p-10 dark:border-blue-900/40 dark:from-blue-950/30 dark:via-slate-950 dark:to-slate-950"
        >
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
            <span className="inline-flex items-center rounded-full bg-blue-600 px-2.5 py-1 text-white">
              <Sparkles className="mr-1 h-3 w-3" aria-hidden />
              Free through 2026
            </span>
            <span>Concierge migration</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl dark:text-white">
            We&apos;ll move your data for you.
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-700 dark:text-slate-200">
            For agents migrating from {source.name}, we&apos;ll personally
            import your contacts, rebuild your most-used sequences, and
            cut you over to LeadSmart within 5 business days. Free with
            a 3-month commitment to Pro tier or higher.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: Download,
                title: "Data import + dedupe",
                body: "We pull your contacts, deals, and notes into LeadSmart — duplicates merged, custom fields preserved.",
              },
              {
                icon: Sparkles,
                title: "Sequence rebuild",
                body: "Your three most-used drip sequences re-implemented in LeadSmart's template library with your copy + cadence.",
              },
              {
                icon: Calendar,
                title: "30-min onboarding call",
                body: "Live walkthrough of your workspace, AI follow-up policy, and missed-call settings — so you're live the same day.",
              },
              {
                icon: CheckCircle2,
                title: "5-business-day guarantee",
                body: "If we can't get you live within 5 business days, your first 3 months on Pro tier are on us.",
              },
            ].map((item) => (
              <li
                key={item.title}
                className="flex gap-3 rounded-2xl bg-white p-4 dark:bg-slate-900"
              >
                <item.icon
                  aria-hidden
                  className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300"
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/contact?topic=concierge-migration&from=${source.slug}`}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Request concierge migration
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >
              Or just start the free trial
            </Link>
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-8 dark:border-slate-800">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">{t("pages.articleChrome.faqLong", { ns: "dashboard" })}</h2>
          <div className="mt-6 space-y-6">
            {source.faq.map((entry, i) => (
              <div key={i}>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {entry.q}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {entry.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-8 text-center dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Looking at another CRM?{" "}
            <Link
              href="/switch-from"
              className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
            >
              See all migration guides
            </Link>
          </p>
        </section>
      </article>
    </div>
  );
}
