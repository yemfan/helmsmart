"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function CapRateMistakesRealEstateInvestorsMakePage() {
  const { t } = useTranslation("dashboard");
  const title = "Cap Rate Mistakes Real Estate Investors Make";
  const url = "https://closebossai.com/cap-rate-mistakes-real-estate-investors-make";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Learn the most common cap rate mistakes real estate investors make and how to avoid them when analyzing rental properties.",
          mainEntity: [
            {
              "@type": "Question",
              name: "What are common mistakes investors make with cap rate?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Common mistakes include underestimating expenses, ignoring vacancy, comparing dissimilar properties or markets, relying on pro forma numbers only, and using cap rate as the only decision metric.",
              },
            },
            {
              "@type": "Question",
              name: "How can I avoid making cap rate mistakes?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Use realistic income and expense assumptions, compare cap rates within the same market and asset type, stress-test your numbers, and always pair cap rate with cash flow and ROI analysis.",
              },
            },
          ],
        }}
      />

      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-3">{title}</h1>
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateMistakes.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMistakes.m1Title")}</h2>
        <p>{t("pages.capRateMistakes.m1a")}</p>
        <p>{t("pages.capRateMistakes.m1b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMistakes.m2Title")}</h2>
        <p>{t("pages.capRateMistakes.m2a")}</p>
        <p>{t("pages.capRateMistakes.m2b")}{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}{t("pages.capRateMistakes.m2c")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMistakes.m3Title")}</h2>
        <p>{t("pages.capRateMistakes.m3a")}</p>
        <p>{t("pages.capRateMistakes.m3b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMistakes.m4Title")}</h2>
        <p>{t("pages.capRateMistakes.m4a")}</p>
        <p>{t("pages.capRateMistakes.m4b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMistakes.m5Title")}</h2>
        <p>{t("pages.capRateMistakes.m5a")}</p>
        <p>{t("pages.capRateMistakes.m5b")}{" "}
          <Link href="/roi-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.capRateMistakes.irrLink")}</Link>{" "}{t("pages.capRateMistakes.m5c")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMistakes.m6Title")}</h2>
        <p>{t("pages.capRateMistakes.m6a")}</p>
        <p>{t("pages.capRateMistakes.m6b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMistakes.m7Title")}</h2>
        <p>{t("pages.capRateMistakes.m7a")}</p>
        <p>{t("pages.capRateMistakes.m7b")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>
          . This shows you how cap rate and cash flow change if rents come in lower or expenses come
          in higher than expected.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMistakes.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateMistakes.q1")}</h3>
        <p>{t("pages.capRateMistakes.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateMistakes.q2")}</h3>
        <p>{t("pages.capRateMistakes.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateMistakes.q3")}</h3>
        <p>{t("pages.capRateMistakes.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateMistakes.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateMistakes.ctaBody")}</p>
        <div className="flex flex-wrap gap-3 mb-4">
          <Link
            href="/cap-rate-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >{t("pages.articleChrome.openCapRate")}</Link>
          <Link
            href="/property-investment-analyzer"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.articleChrome.openAnalyzer")}</Link>
        </div>
        <p className="font-semibold">{t("pages.articleChrome.footerCta")}</p>
      </section>
    </div>
  );
}

