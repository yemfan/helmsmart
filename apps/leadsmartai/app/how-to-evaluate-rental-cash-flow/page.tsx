"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function HowToEvaluateRentalCashFlowPage() {
  const { t } = useTranslation("dashboard");
  const title = "How to Evaluate Rental Property Cash Flow";
  const url = "https://closebossai.com/how-to-evaluate-rental-cash-flow";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          url,
          description:
            "Learn how to evaluate rental property cash flow using income, expenses, mortgage payments and vacancy assumptions.",
        }}
      />

      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-3">
        {title}
      </h1>
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.howToGuides.cfIntro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          1. Estimate realistic rental income
        </h2>
        <p>{t("pages.howToGuides.cfRent")}</p>
        <p>{t("pages.howToGuides.cfAnnual")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          2. Include all operating expenses and vacancy
        </h2>
        <p>{t("pages.howToGuides.cfExpenses")}</p>
        <p>{t("pages.howToGuides.cfUseThe")}{" "}
          <Link href="/cash-flow-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}{t("pages.howToGuides.cfToPlug")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          3. Add mortgage payments and test different scenarios
        </h2>
        <p>{t("pages.howToGuides.cfFinancing")}{" "}
          <Link href="/mortgage-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
          to estimate the monthly payment based on purchase price, down payment, rate
          and term. Then enter that into the cash‑flow tools to see net cash flow after
          debt service.
        </p>
        <p>
          Stress‑test the deal by lowering rent, increasing expenses, or modeling a
          higher interest rate. A strong rental should remain acceptable even when
          assumptions move against you.
        </p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.howToGuides.cfCtaTitle")}</h2>
        <p className="mb-3">
          Use this process for every property you consider to avoid negative surprises
          after closing. Good cash‑flow analysis combines realistic local assumptions
          with simple, repeatable math.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/cash-flow-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >{t("pages.articleChrome.openCashFlow")}</Link>
          <Link
            href="/property-investment-analyzer"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.articleChrome.openAnalyzer")}</Link>
        </div>
      </section>
    </div>
  );
}

