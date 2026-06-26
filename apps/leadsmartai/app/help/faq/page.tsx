import type { Metadata } from "next";
import Link from "next/link";
import { groupedFaq, HELP_FAQ } from "@/lib/help/faq";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description:
    "Answers to the most common questions about RealtyBoss: AI follow-up, RealtyBoss Coaching, billing, integrations, and data privacy.",
  alternates: { canonical: "/help/faq" },
  openGraph: {
    title: "FAQ — RealtyBoss",
    description:
      "Answers to common questions about AI follow-up, coaching, billing, integrations, and privacy.",
    url: "/help/faq",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FAQ — RealtyBoss",
    description:
      "Common questions about RealtyBoss: follow-up, coaching, billing, integrations, privacy.",
  },
};

/**
 * Public FAQ page. Emits a single FAQPage JSON-LD payload over
 * the full HELP_FAQ array so every entry is eligible for SERP
 * rich-result rendering. The visible Q&A is rendered from the
 * same array — if you change one, the schema follows automatically.
 */
export default function HelpFaqPage() {
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
            Help center
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">FAQ</span>
        </nav>

        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            Frequently asked questions
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Quick answers to the questions agents ask most. Looking
            for a step-by-step walkthrough instead?{" "}
            <Link
              href="/help"
              className="font-semibold text-blue-700 hover:underline"
            >
              Browse the how-to guides
            </Link>
            .
          </p>
        </header>

        <div className="mt-10 space-y-12">
          {groups.map((group) => (
            <section key={group.category} id={group.category} className="scroll-mt-20">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </h2>
              <div className="mt-4 space-y-3">
                {group.entries.map((entry) => (
                  <details
                    key={entry.q}
                    className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-slate-900">
                      <span>{entry.q}</span>
                      <span
                        className="text-blue-600 transition group-open:rotate-45"
                        aria-hidden
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      {entry.a}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-600">
            Didn&apos;t find what you needed?{" "}
            <a
              href="mailto:contact@helmsmart.ai"
              className="font-semibold text-blue-700 hover:underline"
            >
              Email support
            </a>{" "}
            or{" "}
            <Link
              href="/contact"
              className="font-semibold text-blue-700 hover:underline"
            >
              send us a note
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
