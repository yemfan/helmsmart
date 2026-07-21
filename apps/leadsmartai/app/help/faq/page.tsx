import type { Metadata } from "next";
import Link from "next/link";
import { groupedFaq, HELP_FAQ } from "@/lib/help/faq";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const th = (key: string): string => t(key, { ns: "web_help" });
  return {
    title: th("meta.faq_title"),
    description: th("meta.faq_description"),
    alternates: { canonical: "/help/faq" },
    openGraph: {
      title: th("meta.faq_og_title"),
      description: th("meta.faq_og_description"),
      url: "/help/faq",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: th("meta.faq_twitter_title"),
      description: th("meta.faq_twitter_description"),
    },
  };
}

/**
 * Public FAQ page. Emits a single FAQPage JSON-LD payload over
 * the full HELP_FAQ array so every entry is eligible for SERP
 * rich-result rendering. The JSON-LD schema stays in the canonical
 * English copy (stable for crawlers); the visible Q&A + category
 * labels are localized via the `web_help` namespace, keyed by each
 * entry's stable `key` / `category`.
 */
export default async function HelpFaqPage() {
  const t = await getServerT();
  const th = (key: string): string => t(key, { ns: "web_help" });
  const groups = groupedFaq();

  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: HELP_FAQ.map((entry) => ({
              "@type": "Question",
              name: entry.q,
              acceptedAnswer: { "@type": "Answer", text: entry.a },
            })),
          }),
        }}
      />

      <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-slate-500">
          <Link href="/help" className="hover:text-slate-700">
            {th("faq_page.breadcrumb_help")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">{th("faq_page.breadcrumb_faq")}</span>
        </nav>

        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            {th("faq_page.h1")}
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            {th("faq_page.subtitle_pre")}
            <Link
              href="/help"
              className="font-semibold text-blue-700 hover:underline"
            >
              {th("faq_page.subtitle_link")}
            </Link>
            {th("faq_page.subtitle_post")}
          </p>
        </header>

        <div className="mt-10 space-y-12">
          {groups.map((group) => (
            <section key={group.category} id={group.category} className="scroll-mt-20">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                {th(`faq_categories.${group.category}`)}
              </h2>
              <div className="mt-4 space-y-3">
                {group.entries.map((entry) => (
                  <details
                    key={entry.key}
                    className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-slate-900">
                      <span>{th(`faq.${entry.key}.q`)}</span>
                      <span
                        className="text-blue-600 transition group-open:rotate-45"
                        aria-hidden
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {th(`faq.${entry.key}.a`)}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-600">
            {th("faq_page.footer_pre")}
            <a
              href="mailto:contact@closebossai.com"
              className="font-semibold text-blue-700 hover:underline"
            >
              {th("faq_page.footer_email")}
            </a>
            {th("faq_page.footer_mid")}
            <Link
              href="/contact"
              className="font-semibold text-blue-700 hover:underline"
            >
              {th("faq_page.footer_link")}
            </Link>
            {th("faq_page.footer_post")}
          </p>
        </section>
      </div>
    </div>
  );
}
