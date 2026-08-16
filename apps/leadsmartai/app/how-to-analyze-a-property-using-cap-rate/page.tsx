"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function HowToAnalyzeAPropertyUsingCapRatePage() {
  const { t } = useTranslation("dashboard");
  const title = "How to Analyze a Property Using Cap Rate";
  const url = "https://closebossai.com/how-to-analyze-a-property-using-cap-rate";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Step-by-step guide on how to analyze a rental property using cap rate, from estimating income and expenses to comparing deals and setting buy-box criteria.",
          mainEntity: [
            {
              "@type": "Question",
              name: "How do you analyze a property using cap rate?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "To analyze a property using cap rate, estimate net operating income (NOI), divide it by the purchase price or value to get cap rate, then compare that cap rate to similar properties and your target range.",
              },
            },
            {
              "@type": "Question",
              name: "Is cap rate enough to fully analyze a rental property?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rate is a powerful first filter, but it is not enough on its own. Investors should also analyze cash flow, financing, reserves, and long-term ROI before buying.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.analyzeWithCapRate.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.analyzeWithCapRate.s1Title")}</h2>
        <p>{t("pages.analyzeWithCapRate.s1Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.analyzeWithCapRate.incomeLabel")}</span>{t("pages.analyzeWithCapRate.income")}</li>
          <li>
            <span className="font-semibold">{t("pages.analyzeWithCapRate.expensesLabel")}</span>{t("pages.analyzeWithCapRate.expenses")}</li>
          <li>
            <span className="font-semibold">{t("pages.analyzeWithCapRate.priceLabel")}</span>{t("pages.analyzeWithCapRate.price")}</li>
        </ul>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.analyzeWithCapRate.s2Title")}</h2>
        <p>{t("pages.analyzeWithCapRate.s2Body")}</p>
        <p>{t("pages.analyzeWithCapRate.framework")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Start with potential rent: monthly rent × 12.</li>
          <li>{t("pages.analyzeWithCapRate.f1")}</li>
          <li>{t("pages.analyzeWithCapRate.f2")}</li>
          <li>{t("pages.analyzeWithCapRate.f3")}</li>
        </ul>
        <p>
          The result is your estimated NOI. For quick analysis, you can plug these numbers into the{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}
          to avoid doing the math by hand.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.analyzeWithCapRate.s3Title")}</h2>
        <p>{t("pages.analyzeWithCapRate.s3Body")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = Net Operating Income (NOI) ÷ Purchase Price or Value
        </p>
        <p>
          For example, if NOI is $20,000 and the property costs $300,000, cap rate is about 6.67%
          ($20,000 ÷ $300,000). This tells you that, before financing, the property&apos;s income
          yield is 6.67% of the price.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.analyzeWithCapRate.s4Title")}</h2>
        <p>{t("pages.analyzeWithCapRate.s4Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.analyzeWithCapRate.s4i1")}</li>
          <li>Look at recent sales comps and compute NOI ÷ sale price.</li>
          <li>{t("pages.analyzeWithCapRate.s4i2")}</li>
        </ul>
        <p>{t("pages.analyzeWithCapRate.s4Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.analyzeWithCapRate.s5Title")}</h2>
        <p>{t("pages.analyzeWithCapRate.s5Body")}</p>
        <p>{t("pages.analyzeWithCapRate.nextLayer")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Detailed cash-flow projections using the{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.cashFlowCalculator")}</Link>
            .
          </li>
          <li>
            Financing scenarios and long-term ROI in the{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>
            .
          </li>
          <li>{t("pages.analyzeWithCapRate.inspections")}</li>
        </ul>
        <p>{t("pages.analyzeWithCapRate.s5Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.analyzeWithCapRate.exampleTitle")}</h2>
        <p>
          Imagine a small rental listed at $280,000. Market rent is $2,100 per month, with tenants
          paying utilities.
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Gross annual rent: $2,100 × 12 = $25,200.</li>
          <li>Vacancy allowance (5%): $1,260.</li>
          <li>Effective income: $25,200 – $1,260 = $23,940.</li>
          <li>
            Estimated expenses: $5,000 taxes, $1,200 insurance, $1,800 maintenance, $1,917
            management (8% of effective income), total ≈ $9,917.
          </li>
          <li>NOI ≈ $23,940 – $9,917 = $14,023.</li>
        </ul>
        <p>
          Cap rate ≈ $14,023 ÷ $280,000 ≈ 5.0%. You can now compare this 5% cap rate to your target
          range and to other properties you are analyzing.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.analyzeWithCapRate.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.analyzeWithCapRate.q1")}</h3>
        <p>{t("pages.analyzeWithCapRate.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.analyzeWithCapRate.q2")}</h3>
        <p>{t("pages.analyzeWithCapRate.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.analyzeWithCapRate.q3")}</h3>
        <p>{t("pages.analyzeWithCapRate.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.analyzeWithCapRate.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.analyzeWithCapRate.ctaBody")}</p>
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

