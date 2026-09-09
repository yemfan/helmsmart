import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return {
    title: t("faq.meta.title"),
    description: t("faq.meta.description"),
  };
}

// Every question and answer lives in `site.faq.categories.<id>.items.<id>`;
// this array holds only the order.
const faqs: { category: string; questions: string[] }[] = [
  {
    category: "gettingStarted",
    questions: ["what", "setup", "technical", "trial"],
  },
  {
    category: "voice",
    questions: ["unknown", "booking", "languages", "disclosure"],
  },
  {
    category: "billing",
    questions: ["changePlans", "voiceCharge", "contract"],
  },
  {
    category: "integrations",
    questions: ["googleCalendar", "phone", "import"],
  },
];

export default async function FAQPage() {
  const t = await getServerT("site");

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28">
        {/* Header */}
        <div className="mb-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {t("faq.hero.title")}
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            {t("faq.hero.subtitle")}
          </p>
        </div>

        {/* FAQ Categories */}
        <div className="space-y-12">
          {faqs.map((section) => (
            <section key={section.category}>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
                {t(`faq.categories.${section.category}.title`)}
              </h2>
              <div className="divide-y divide-gray-200 rounded-xl border border-gray-200">
                {section.questions.map((id) => (
                  <details
                    key={id}
                    className="group px-6 py-5 [&[open]>summary>span>svg]:rotate-180"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                      <span className="text-base font-medium text-gray-900">
                        {t(`faq.categories.${section.category}.items.${id}.q`)}
                      </span>
                      <span className="flex-shrink-0 text-gray-400">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-5 w-5 transition-transform duration-200"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    </summary>
                    <p className="mt-3 text-base leading-relaxed text-gray-600">
                      {t(`faq.categories.${section.category}.items.${id}.a`)}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* CTA footer */}
        <div className="mt-20 rounded-2xl bg-gray-50 px-8 py-10 text-center">
          <h3 className="text-lg font-semibold text-gray-900">
            {t("faq.cta.title")}
          </h3>
          <p className="mt-2 text-base text-gray-500">
            {t("faq.cta.body")}
          </p>
          <a
            href="mailto:contact@helmsmart.ai"
            className="mt-6 inline-block rounded-lg bg-gray-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            {t("faq.cta.button")}
          </a>
        </div>
      </div>
    </main>
  );
}
