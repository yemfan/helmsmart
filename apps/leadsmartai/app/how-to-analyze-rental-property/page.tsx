"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function HowToAnalyzeRentalPropertyPage() {
  const { t } = useTranslation("dashboard");
  const title = "How to Analyze a Rental Property";
  const url = "https://closebossai.com/how-to-analyze-rental-property";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          url,
          description:
            "Step-by-step framework for analyzing rental properties using cash flow, cap rate, NOI and ROI calculators.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.analyzeRental.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("pages.analyzeRental.step1Title")}
        </h2>
        <p>{t("pages.analyzeRental.s1")}</p>
        <p>{t("pages.analyzeRental.useThe")}{" "}
          <Link href="/cash-flow-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}{t("pages.analyzeRental.toInput")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("pages.analyzeRental.step2Title")}
        </h2>
        <p>{t("pages.analyzeRental.s2")}</p>
        <p>{t("pages.analyzeRental.plugSame")}{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}{t("pages.analyzeRental.sideBySide")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("pages.analyzeRental.step3Title")}
        </h2>
        <p>{t("pages.analyzeRental.s3")}{" "}
          <Link href="/mortgage-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}{t("pages.analyzeRental.feedInto")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}
          or{" "}
          <Link href="/roi-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.roiCalculator")}</Link>{" "}
          to see cash‑on‑cash ROI and long‑term equity growth.
        </p>
        <p>
          This step shows you how financing magnifies or reduces returns compared to
          buying all‑cash, and whether the property still meets your risk and return
          targets once debt service is included.
        </p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.analyzeRental.ctaTitle")}</h2>
        <p className="mb-3">
          Use this simple workflow on every property you consider: estimate income and
          expenses, calculate NOI and cap rate, then model financing and long‑term ROI.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/cash-flow-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >{t("pages.articleChrome.openCashFlow")}</Link>
          <Link
            href="/cap-rate-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.articleChrome.openCapRate")}</Link>
          <Link
            href="/property-investment-analyzer"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.articleChrome.openAnalyzer")}</Link>
        </div>
      </section>
    </div>
  );
}

