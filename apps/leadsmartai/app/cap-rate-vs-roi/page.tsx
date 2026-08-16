"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { getServerT } from "@/lib/i18n/server";

export default async function CapRateVsRoiPage() {
  const t = await getServerT();
  const title = "Cap Rate vs ROI: What’s the Difference for Real Estate Investors?";
  const url = "https://closebossai.com/cap-rate-vs-roi";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Understand the difference between cap rate and ROI in real estate investing, how each metric is calculated, and when investors should use them to analyze rental properties.",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is the main difference between cap rate and ROI?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rate measures a property's income relative to its value using net operating income (NOI), ignoring financing. ROI measures your return on the actual cash you invest, including down payment, financing, and often future sale proceeds.",
              },
            },
            {
              "@type": "Question",
              name: "Should I focus on cap rate or ROI when analyzing deals?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Use cap rate to compare properties on an apples-to-apples basis and screen deals. Use ROI (and cash-on-cash return) to evaluate whether a specific deal fits your personal goals, financing structure, and risk tolerance.",
              },
            },
            {
              "@type": "Question",
              name: "Can a property have a low cap rate but high ROI?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. A property in a strong, low-cap-rate market can still produce high ROI if you buy below market value, add value through improvements, or use leverage effectively.",
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
        </svg>{t("pages.articles.backHome", { ns: "dashboard" })}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-3">{title}</h1>
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateVsRoi.intro", { ns: "dashboard" })}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsRoi.whatIsCapRate", { ns: "dashboard" })}</h2>
        <p>{t("pages.capRateVsRoi.capRateDef", { ns: "dashboard" })}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = Net Operating Income (NOI) ÷ Purchase Price or Value
        </p>
        <p>{t("pages.capRateVsRoi.capRateProperty", { ns: "dashboard" })}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsRoi.whatIsRoi", { ns: "dashboard" })}</h2>
        <p>{t("pages.capRateVsRoi.roiDef", { ns: "dashboard" })}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          ROI = (Total Profit ÷ Total Cash Invested) × 100%
        </p>
        <p>{t("pages.capRateVsRoi.roiInvestor", { ns: "dashboard" })}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsRoi.keyDifferences", { ns: "dashboard" })}</h2>
        <p>{t("pages.capRateVsRoi.bothMetrics", { ns: "dashboard" })}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateVsRoi.capRateLabel", { ns: "dashboard" })}</span>{t("pages.capRateVsRoi.capRateBullet", { ns: "dashboard" })}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateVsRoi.roiLabel", { ns: "dashboard" })}</span>{t("pages.capRateVsRoi.roiBullet", { ns: "dashboard" })}</li>
        </ul>
        <p>{t("pages.capRateVsRoi.thinkOf", { ns: "dashboard" })}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsRoi.exampleTitle", { ns: "dashboard" })}</h2>
        <p>
          Imagine a small rental property that sells for $300,000 and produces $18,000 in net
          operating income. The cap rate is:
        </p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = $18,000 ÷ $300,000 = 6%
        </p>
        <p>{t("pages.capRateVsRoi.nowCompare", { ns: "dashboard" })}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateVsRoi.investorA", { ns: "dashboard" })}</span> buys all-cash, investing $300,000 of
            their own money.
          </li>
          <li>
            <span className="font-semibold">{t("pages.capRateVsRoi.investorB", { ns: "dashboard" })}</span> uses a 25% down payment ($75,000)
            and finances the rest with a mortgage.
          </li>
        </ul>
        <p>{t("pages.capRateVsRoi.exampleBody", { ns: "dashboard" })}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsRoi.whenToUse", { ns: "dashboard" })}</h2>
        <p>{t("pages.capRateVsRoi.inPractice", { ns: "dashboard" })}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsRoi.useCapWhen", { ns: "dashboard" })}</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateVsRoi.useCap1", { ns: "dashboard" })}</li>
          <li>{t("pages.capRateVsRoi.useCap2", { ns: "dashboard" })}</li>
          <li>{t("pages.capRateVsRoi.useCap3", { ns: "dashboard" })}</li>
          <li>{t("pages.capRateVsRoi.useCap4", { ns: "dashboard" })}</li>
        </ul>
        <h3 className="text-lg font-semibold text-gray-900 mt-4">{t("pages.capRateVsRoi.useRoiWhen", { ns: "dashboard" })}</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateVsRoi.useRoi1", { ns: "dashboard" })}</li>
          <li>{t("pages.capRateVsRoi.useRoi2")}</li>
          <li>{t("pages.capRateVsRoi.useRoi3")}</li>
          <li>{t("pages.capRateVsRoi.useRoi4")}</li>
        </ul>
        <p>{t("pages.capRateVsRoi.inShort")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsRoi.cocTitle")}</h2>
        <p>
          Many investors also rely on{" "}
          <Link href="/cash-flow-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.capRateVsRoi.cocLink")}</Link>{" "}
          alongside cap rate and ROI. Cash-on-cash return measures your annual pre-tax cash flow
          divided by your total cash invested and focuses on the income portion of your returns in
          the early years of a deal.
        </p>
        <p>
          A common workflow is to use the{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.capRateVsRoi.capCalc")}</Link>{" "}
          to screen deals, then switch to the{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.capRateVsRoi.analyzer")}</Link>{" "}
          or ROI-focused tools to model financing, cash-on-cash, and long-term ROI in more detail.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsRoi.faq")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsRoi.q1")}</h3>
        <p>{t("pages.capRateVsRoi.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsRoi.q2")}</h3>
        <p>{t("pages.capRateVsRoi.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsRoi.q3")}</h3>
        <p>{t("pages.capRateVsRoi.a3")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsRoi.q4")}</h3>
        <p>{t("pages.capRateVsRoi.a4")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateVsRoi.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateVsRoi.ctaBody")}</p>
        <div className="flex flex-wrap gap-3 mb-4">
          <Link
            href="/cap-rate-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >{t("pages.capRateVsRoi.openCapCalc")}</Link>
          <Link
            href="/roi-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.capRateVsRoi.openRoiCalc")}</Link>
          <Link
            href="/property-investment-analyzer"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.capRateVsRoi.openAnalyzer")}</Link>
        </div>
        <p className="font-semibold">{t("pages.capRateVsRoi.footerCta")}</p>
      </section>
    </div>
  );
}

