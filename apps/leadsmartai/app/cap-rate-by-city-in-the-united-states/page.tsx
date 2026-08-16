"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function CapRateByCityInTheUnitedStatesPage() {
  const { t } = useTranslation("dashboard");
  const title = "Cap Rate by City in the United States: How Markets Differ";
  const url = "https://closebossai.com/cap-rate-by-city-in-the-united-states";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Understand how cap rates vary by city in the United States, what drives those differences, and how investors can compare markets when analyzing rental properties.",
          mainEntity: [
            {
              "@type": "Question",
              name: "Why do cap rates differ from city to city?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rates vary by city because of differences in demand, supply, risk perception, rent growth expectations, and local economic conditions. High-demand, supply-constrained cities typically have lower cap rates, while riskier or slower-growth markets tend to have higher cap rates.",
              },
            },
            {
              "@type": "Question",
              name: "Are lower cap rate cities always better investments?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Not always. Lower cap rate cities often offer stronger perceived stability and appreciation potential, but they also require more capital for each dollar of income. Higher cap rate cities can produce stronger cash flow but may come with more volatility and management intensity.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateByCity.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateByCity.whyVary")}</h2>
        <p>{t("pages.capRateByCity.whyVaryBody")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateByCity.f1Label")}</span>{t("pages.capRateByCity.f1")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateByCity.f2Label")}</span>{t("pages.capRateByCity.f2")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateByCity.f3Label")}</span>{t("pages.capRateByCity.f3")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateByCity.f4Label")}</span>{t("pages.capRateByCity.f4")}</li>
        </ul>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateByCity.patterns")}</h2>
        <p>{t("pages.capRateByCity.patternsBody")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateByCity.t1Label")}</span>{t("pages.capRateByCity.t1")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateByCity.t2Label")}</span>{t("pages.capRateByCity.t2")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateByCity.t3Label")}</span>{t("pages.capRateByCity.t3")}</li>
        </ul>
        <p>{t("pages.capRateByCity.compareLocal")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateByCity.research")}</h2>
        <p>{t("pages.capRateByCity.researchBody")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateByCity.r1")}</li>
          <li>Review recent sales comps and compute NOI ÷ sale price for comparable properties.</li>
          <li>{t("pages.capRateByCity.r2")}</li>
          <li>{t("pages.articleLinks.useToolsLike")}{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}{t("pages.articleLinks.againstThoseRanges")}</li>
        </ul>
        <p>{t("pages.capRateByCity.researchClose")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateByCity.strategy")}</h2>
        <p>{t("pages.capRateByCity.strategyBody")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateByCity.s1Label")}</span>{t("pages.capRateByCity.s1")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateByCity.s2Label")}</span>{t("pages.capRateByCity.s2")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateByCity.s3Label")}</span>{t("pages.capRateByCity.s3")}</li>
        </ul>
        <p>{t("pages.articleLinks.the")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}{t("pages.articleLinks.standardizeAcrossCities")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateByCity.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateByCity.q1")}</h3>
        <p>{t("pages.capRateByCity.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateByCity.q2")}</h3>
        <p>{t("pages.capRateByCity.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateByCity.q3")}</h3>
        <p>{t("pages.capRateByCity.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateByCity.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateByCity.ctaBody")}</p>
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

