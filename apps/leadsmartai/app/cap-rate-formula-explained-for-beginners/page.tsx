"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function CapRateFormulaExplainedForBeginnersPage() {
  const { t } = useTranslation("dashboard");
  const title = "Cap Rate Formula Explained for Beginners";
  const url = "https://closebossai.com/cap-rate-formula-explained-for-beginners";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Learn the cap rate formula step by step, what each part means, and how beginners can use cap rate to quickly analyze rental properties.",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is the formula for cap rate?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rate is calculated as net operating income (NOI) divided by the property's purchase price or current market value. Cap Rate = NOI ÷ Price.",
              },
            },
            {
              "@type": "Question",
              name: "What does cap rate tell a real estate investor?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rate shows the annual income a property produces relative to its value, assuming an all-cash purchase and ignoring financing. It's a quick way to compare income yields across properties.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateFormula.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateFormula.basicTitle")}</h2>
        <p>{t("pages.capRateFormula.basicBody")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = Net Operating Income (NOI) ÷ Purchase Price or Market Value
        </p>
        <p>{t("pages.capRateFormula.basicResult")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateFormula.step1Title")}</h2>
        <p>{t("pages.capRateFormula.step1Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateFormula.includedLabel")}</span>{t("pages.capRateFormula.included")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateFormula.notIncludedLabel")}</span>{t("pages.capRateFormula.notIncluded")}</li>
        </ul>
        <p>
          For example, if a property collects $30,000 in annual rent and has $10,000 in operating
          expenses, its NOI is $20,000.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateFormula.step2Title")}</h2>
        <p>{t("pages.capRateFormula.step2Body")}</p>
        <p>{t("pages.capRateFormula.step2Tip")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateFormula.step3Title")}</h2>
        <p>{t("pages.capRateFormula.step3Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>NOI = $18,000 per year</li>
          <li>Purchase price = $300,000</li>
        </ul>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = $18,000 ÷ $300,000 = 0.06, or 6%
        </p>
        <p>{t("pages.capRateFormula.step3Result")}</p>
        <p>
          You can also skip the manual math by using the{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}
          in CloseBoss: enter rent, expenses, and price, and it instantly computes NOI and cap
          rate for you.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateFormula.step4Title")}</h2>
        <p>{t("pages.capRateFormula.step4Body")}</p>
        <p>{t("pages.capRateFormula.forExample")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateFormula.propA")}</li>
          <li>{t("pages.capRateFormula.propB")}</li>
          <li>{t("pages.capRateFormula.propC")}</li>
        </ul>
        <p>{t("pages.capRateFormula.step4Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateFormula.mistakesTitle")}</h2>
        <p>{t("pages.capRateFormula.mistakesIntro")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateFormula.m1Label")}</span>{t("pages.capRateFormula.m1")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateFormula.m2Label")}</span>{t("pages.capRateFormula.m2")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateFormula.m3Label")}</span>{t("pages.capRateFormula.m3")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateFormula.m4Label")}</span>{t("pages.capRateFormula.m4")}</li>
        </ul>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateFormula.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateFormula.q1")}</h3>
        <p>{t("pages.capRateFormula.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateFormula.q2")}</h3>
        <p>{t("pages.capRateFormula.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateFormula.q3")}</h3>
        <p>{t("pages.capRateFormula.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateFormula.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateFormula.ctaBody")}</p>
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

