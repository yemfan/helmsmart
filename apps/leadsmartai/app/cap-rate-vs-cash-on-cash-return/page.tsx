"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function CapRateVsCashOnCashReturnPage() {
  const { t } = useTranslation("dashboard");
  const title = "Cap Rate vs Cash on Cash Return: Which Metric Should Real Estate Investors Use?";
  const url = "https://closebossai.com/cap-rate-vs-cash-on-cash-return";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Learn the difference between cap rate and cash on cash return, how to calculate each metric, and when real estate investors should rely on them to analyze rental properties.",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is the difference between cap rate and cash on cash return?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rate compares a property's net operating income (NOI) to its value and ignores financing. Cash on cash return compares annual pre-tax cash flow to the actual cash you invest, including down payment and closing costs.",
              },
            },
            {
              "@type": "Question",
              name: "When should I use cash on cash return instead of cap rate?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Use cash on cash return when you want to understand how hard your invested cash is working after financing. Use cap rate to compare property-level income yields before financing and to screen deals quickly.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateVsCoc.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.articleChrome.whatIsCapRate")}</h2>
        <p>{t("pages.capRateVsCoc.capDef")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = Net Operating Income (NOI) ÷ Purchase Price or Value
        </p>
        <p>{t("pages.capRateVsCoc.capUse")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsCoc.cocTitle")}</h2>
        <p>{t("pages.capRateVsCoc.cocDef")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cash on Cash Return = Annual Pre-Tax Cash Flow ÷ Total Cash Invested
        </p>
        <p>{t("pages.capRateVsCoc.cocFlow")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsCoc.exampleTitle")}</h2>
        <p>
          Imagine a rental property with a purchase price of $300,000 and net operating income of
          $21,000. The cap rate is:
        </p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = $21,000 ÷ $300,000 = 7%
        </p>
        <p>{t("pages.capRateVsCoc.exampleBody")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Down payment: 25% of $300,000 = $75,000</li>
          <li>Closing costs and initial repairs: $10,000</li>
          <li>Total cash invested: $85,000</li>
        </ul>
        <p>
          Suppose the annual debt service (principal and interest) is $15,000. The annual pre-tax
          cash flow would be:
        </p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Annual Cash Flow = NOI $21,000 – Debt Service $15,000 = $6,000
        </p>
        <p>{t("pages.capRateVsCoc.cocIs")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cash on Cash = $6,000 ÷ $85,000 ≈ 7.1%
        </p>
        <p>{t("pages.capRateVsCoc.exampleClose")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsCoc.whenTitle")}</h2>
        <p>{t("pages.capRateVsCoc.whenBody")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsCoc.capBest")}</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateVsCoc.cb1")}</li>
          <li>{t("pages.capRateVsCoc.cb2")}</li>
          <li>{t("pages.capRateVsCoc.cb3")}</li>
          <li>{t("pages.capRateVsCoc.cb4")}</li>
        </ul>
        <h3 className="text-lg font-semibold text-gray-900 mt-4">{t("pages.capRateVsCoc.cocBest")}</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateVsCoc.ob1")}</li>
          <li>{t("pages.capRateVsCoc.ob2")}</li>
          <li>{t("pages.capRateVsCoc.ob3")}</li>
          <li>{t("pages.capRateVsCoc.ob4")}</li>
        </ul>
        <p>{t("pages.capRateVsCoc.together")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsCoc.calcTitle")}</h2>
        <p>
          Doing these calculations by hand is valuable once or twice, but it quickly becomes tedious
          when you are screening dozens of properties. That&apos;s why many investors use tools
          like the{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}
          and the{" "}
          <Link href="/cash-flow-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}
          in CloseBoss to model cap rate, cash on cash return, and long-term ROI in one view.
        </p>
        <p>{t("pages.capRateVsCoc.calcBody")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.articleChrome.faqLong")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsCoc.q1")}</h3>
        <p>{t("pages.capRateVsCoc.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsCoc.q2")}</h3>
        <p>{t("pages.capRateVsCoc.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsCoc.q3")}</h3>
        <p>{t("pages.capRateVsCoc.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateVsCoc.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateVsCoc.ctaBody")}</p>
        <div className="flex flex-wrap gap-3 mb-4">
          <Link
            href="/cap-rate-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >{t("pages.articleChrome.openCapRate")}</Link>
          <Link
            href="/cash-flow-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.articleChrome.openCashFlow")}</Link>
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

