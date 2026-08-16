"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function CapRateVsGrossRentMultiplierPage() {
  const { t } = useTranslation("dashboard");
  const title = "Cap Rate vs Gross Rent Multiplier (GRM): Which Should You Use?";
  const url = "https://closebossai.com/cap-rate-vs-gross-rent-multiplier";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Understand the difference between cap rate and gross rent multiplier (GRM), how to calculate each, and when real estate investors should use them to analyze rental properties.",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is the difference between cap rate and gross rent multiplier?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rate uses net operating income (NOI) and considers operating expenses, while gross rent multiplier (GRM) uses gross rent only and ignores expenses. Cap rate is more precise; GRM is faster but cruder.",
              },
            },
            {
              "@type": "Question",
              name: "Is cap rate better than GRM?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rate is usually more informative because it includes expenses, but GRM can still be useful as a quick screening tool when detailed expense data is not yet available.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateVsGrm.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.articleChrome.whatIsCapRate")}</h2>
        <p>{t("pages.capRateVsGrm.capDef")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = Net Operating Income (NOI) ÷ Purchase Price or Value
        </p>
        <p>{t("pages.capRateVsGrm.capMore")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsGrm.grmTitle")}</h2>
        <p>{t("pages.capRateVsGrm.grmDef")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          GRM = Purchase Price ÷ Gross Annual Rent
        </p>
        <p>{t("pages.capRateVsGrm.grmMore")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsGrm.exampleTitle")}</h2>
        <p>
          Suppose a duplex costs $360,000 and brings in $3,000 per month in rent ($36,000 per year).
          The gross rent multiplier is:
        </p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          GRM = $360,000 ÷ $36,000 = 10
        </p>
        <p>
          Now, estimate operating expenses (taxes, insurance, maintenance, utilities, management,
          etc.) at $14,000 per year. Net operating income is:
        </p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          NOI = $36,000 – $14,000 = $22,000
        </p>
        <p>{t("pages.capRateVsGrm.capRateIs")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = $22,000 ÷ $360,000 ≈ 6.1%
        </p>
        <p>{t("pages.capRateVsGrm.exampleClose")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsGrm.whenTitle")}</h2>
        <p>{t("pages.capRateVsGrm.whenIntro")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsGrm.useGrmWhen")}</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateVsGrm.grm1")}</li>
          <li>{t("pages.capRateVsGrm.grm2")}</li>
          <li>{t("pages.capRateVsGrm.grm3")}</li>
        </ul>
        <h3 className="text-lg font-semibold text-gray-900 mt-4">{t("pages.capRateVsGrm.useCapWhen")}</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateVsGrm.cap1")}</li>
          <li>{t("pages.capRateVsGrm.cap2")}</li>
          <li>{t("pages.capRateVsGrm.cap3")}</li>
        </ul>
        <p>{t("pages.capRateVsGrm.inPractice")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>
          .
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsGrm.relateTitle")}</h2>
        <p>{t("pages.capRateVsGrm.relateA")}</p>
        <p>{t("pages.capRateVsGrm.relateB")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate ≈ (NOI ÷ Price) = (0.60 × Gross Rent) ÷ Price = 0.60 ÷ GRM
        </p>
        <p>{t("pages.capRateVsGrm.relateC")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsGrm.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">
          Is there a “good” GRM like there is a “good” cap rate?
        </h3>
        <p>{t("pages.capRateVsGrm.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsGrm.q2")}</h3>
        <p>{t("pages.capRateVsGrm.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsGrm.q3")}</h3>
        <p>{t("pages.capRateVsGrm.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateVsGrm.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateVsGrm.ctaBody")}</p>
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

