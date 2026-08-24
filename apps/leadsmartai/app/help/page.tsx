import type { Metadata } from "next";
import Link from "next/link";
import { HELP_FAQ_CATEGORIES } from "@/lib/help/faq";
import { groupedGuides } from "@/lib/help/guides";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const th = (key: string): string => t(key, { ns: "web_help" });
  return {
    title: th("meta.title"),
    description: th("meta.description"),
    alternates: { canonical: "/help" },
    openGraph: {
      title: th("meta.og_title"),
      description: th("meta.og_description"),
      url: "/help",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: th("meta.twitter_title"),
      description: th("meta.twitter_description"),
    },
  };
}

/**
 * Public help center index. Aggregates the FAQ + how-to guides
 * registered in lib/help/. The page is intentionally simple —
 * deep-links into specific FAQ categories and per-guide pages
 * carry the long-tail SEO content.
 *
 * Category labels/descriptions + page chrome are localized via the
 * `web_help` namespace. Individual guide titles/descriptions/bodies
 * still render from lib/help/guides.ts in English (tracked as a
 * follow-up localization batch).
 */
export default async function HelpIndexPage() {
  const t = await getServerT();
  const th = (key: string): string => t(key, { ns: "web_help" });
  const guideGroups = groupedGuides();

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
            {th("index.eyebrow")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl">
            {th("index.h1")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">
            {th("index.subtitle")}
          </p>
        </header>

        {/* The single most-asked-for thing: "where do I configure X". Give it
            a front door instead of leaving it to search. */}
        <section className="mt-10">
          <Link
            href="/help/settings"
            className="block rounded-2xl border border-blue-200 bg-blue-50/60 px-5 py-4 transition hover:bg-blue-50"
          >
            <p className="text-base font-semibold text-slate-900">{th("index.settings_ref_title")} <span aria-hidden>→</span></p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {th("index.settings_ref_body")}
            </p>
          </Link>
        </section>

        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900 md:text-2xl">
              {th("index.guides_h2")}
            </h2>
            <p className="text-sm text-slate-500">
              {th("index.guides_note")}
            </p>
          </div>

          <nav aria-label={th("index.browse_a11y")} className="mt-6">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {guideGroups.map((group) => (
                <li key={group.category}>
                  <a
                    href={`#${group.category}`}
                    className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {th(`guide_categories.${group.category}.label`)}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      ({group.guides.length})
                    </span>{" "}
                    →
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {guideGroups.map((group) => (
            <div key={group.category} id={group.category} className="mt-10 scroll-mt-24">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                {th(`guide_categories.${group.category}.label`)}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {th(`guide_categories.${group.category}.description`)}
              </p>
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {group.guides.map((guide) => (
                  <li key={guide.slug}>
                    <Link
                      href={`/help/guides/${guide.slug}`}
                      className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {guide.readTime}
                      </p>
                      <h4 className="mt-1 text-base font-semibold text-slate-900 group-hover:text-blue-700">
                        {guide.title}
                      </h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {guide.description}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="mt-16">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900 md:text-2xl">
              {th("index.faq_h2")}
            </h2>
            <Link
              href="/help/faq"
              className="text-sm font-semibold text-blue-700 hover:underline"
            >
              {th("index.faq_see_all")}
            </Link>
          </div>
          <ul className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {HELP_FAQ_CATEGORIES.map((cat) => (
              <li key={cat.id}>
                <Link
                  href={`/help/faq#${cat.id}`}
                  className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  {th(`faq_categories.${cat.id}`)} →
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-8 text-center md:p-12">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            {th("index.stuck_h2")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
            {th("index.stuck_body")}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="mailto:contact@closebossai.com"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              {th("index.stuck_email")}
            </a>
            <Link
              href="/contact"
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-300"
            >
              {th("index.stuck_contact")}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
