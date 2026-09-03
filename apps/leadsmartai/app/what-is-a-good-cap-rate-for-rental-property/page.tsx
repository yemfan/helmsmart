"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function WhatIsAGoodCapRateForRentalPropertyPage() {
  const { t } = useTranslation("dashboard");
  const title = "What Is a Good Cap Rate for Rental Property?";
  const url = "https://closebossai.com/what-is-a-good-cap-rate-for-rental-property";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Learn what a good cap rate is for rental properties in different markets, how to balance risk and return, and how investors can use cap rate ranges to screen deals.",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is a good cap rate for rental property?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "A good cap rate depends on the market, property type, and risk level. In many U.S. markets, 3%–5% is common in prime areas, 5%–8% in balanced markets, and 8%+ in higher-risk or tertiary locations.",
              },
            },
            {
              "@type": "Question",
              name: "Is a higher cap rate always better?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Higher cap rates often indicate higher income but can also come with higher risk, weaker locations, or more management challenges. Investors should balance cap rate with stability, appreciation potential, and personal goals.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.goodCapRate.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.goodCapRate.s1Title")}</h2>
        <p>{t("pages.goodCapRate.s1a")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = Net Operating Income (NOI) ÷ Purchase Price or Market Value
        </p>
        <p>{t("pages.goodCapRate.s1b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.goodCapRate.s2Title")}</h2>
        <p>{t("pages.goodCapRate.s2Intro")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.goodCapRate.lowLabel")}</span> {t("pages.goodCapRate.lowBody")}</li>
          <li>
            <span className="font-semibold">{t("pages.goodCapRate.midLabel")}</span> {t("pages.goodCapRate.midBody")}</li>
          <li>
            <span className="font-semibold">{t("pages.goodCapRate.highLabel")}</span> {t("pages.goodCapRate.highBody")}</li>
        </ul>
        <p>{t("pages.goodCapRate.s2Close")}{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}{t("pages.goodCapRate.s2CloseTail")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.goodCapRate.s3Title")}</h2>
        <p>{t("pages.goodCapRate.s3Intro")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.goodCapRate.incomeFocused")}</span> {t("pages.goodCapRate.incomeFocusedBody")}</li>
          <li>
            <span className="font-semibold">{t("pages.goodCapRate.apprFocused")}</span> {t("pages.goodCapRate.apprFocusedBody")}</li>
          <li>
            <span className="font-semibold">{t("pages.goodCapRate.balanced")}</span> {t("pages.goodCapRate.balancedBody")}</li>
        </ul>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.goodCapRate.s4Title")}</h2>
        <p>{t("pages.goodCapRate.s4a")}</p>
        <p>{t("pages.goodCapRate.s4b")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}
          {t("common:conjunctions.and")}{" "}
          <Link href="/cash-flow-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}
          —to model cash-on-cash return, financing, reserves, and long-term ROI.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.goodCapRate.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.goodCapRate.q1")}</h3>
        <p>{t("pages.goodCapRate.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.goodCapRate.q2")}</h3>
        <p>{t("pages.goodCapRate.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.goodCapRate.q3")}</h3>
        <p>{t("pages.goodCapRate.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.goodCapRate.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.goodCapRate.ctaBody")}</p>
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

