"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function WhatIsCapRateInRealEstateInvestingPage() {
  const { t } = useTranslation("dashboard");
  const title = "What Is Cap Rate in Real Estate Investing?";
  const url = "https://closebossai.com/what-is-cap-rate-in-real-estate-investing";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Learn what cap rate is, how to calculate it step by step, and how real estate investors can use cap rates to analyze rental properties and compare deals.",
          mainEntity: [
            {
              "@type": "Question",
              name: "Is a higher cap rate always better?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "A higher cap rate usually means a higher income yield relative to price, but it can also signal higher risk, weaker locations, or more management headaches. Investors should balance cap rate with property quality, market strength, and long-term growth potential rather than chasing the highest number.",
              },
            },
            {
              "@type": "Question",
              name: "Does cap rate include mortgage payments?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Cap rate is based on net operating income (NOI) divided by property value and ignores financing. It does not include mortgage payments, loan interest, or taxes. Those are considered when calculating cash-on-cash return or overall ROI.",
              },
            },
            {
              "@type": "Question",
              name: "What is a good cap rate for rental property?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "A good cap rate depends on the market, property type, and risk level. In many U.S. markets, 3%–5% is common in prime areas, 5%–8% in balanced markets, and 8%+ in higher-risk or tertiary locations. Investors should compare cap rates to local norms and their own risk tolerance.",
              },
            },
            {
              "@type": "Question",
              name: "Can cap rate be negative?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. If a property’s operating expenses exceed its income, net operating income (NOI) is negative and so is cap rate. Negative cap rates usually indicate distressed or poorly performing properties that need deeper analysis.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.whatIsCapRate.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.articleChrome.whatIsCapRate")}</h2>
        <p>{t("pages.whatIsCapRate.core")}</p>
        <p>{t("pages.whatIsCapRate.applesToApples")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = Net Operating Income (NOI) ÷ Purchase Price or Market Value
        </p>
        <p>{t("pages.whatIsCapRate.noiDef")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whatIsCapRate.stepByStep")}</h2>
        <p>
          To calculate cap rate on any rental property, you can follow a straightforward process.
          These are the same steps you&apos;ll see inside the{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}
          in CloseBoss.
        </p>
        <h3 className="text-lg font-semibold text-gray-900">1. Estimate gross rental income</h3>
        <p>
          Start with how much rent the property will collect in one year. For example, if the
          property rents for $2,000 per month:
        </p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          $2,000 × 12 months = $24,000 per year in rent
        </p>
        <p>{t("pages.whatIsCapRate.step1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">
          2. Account for vacancy and credit loss
        </h3>
        <p>{t("pages.whatIsCapRate.step2")}</p>
        <p>
          If your total gross income is $25,080 and you assume 5% vacancy and credit loss, you
          would subtract $1,254 to get effective gross income of $23,826.
        </p>
        <h3 className="text-lg font-semibold text-gray-900">3. Estimate operating expenses</h3>
        <p>{t("pages.whatIsCapRate.step3")}</p>
        <p>
          For example, you might have $4,500 in property taxes, $1,200 in insurance, $1,800 in
          maintenance, $1,906 for property management, $1,000 in utilities, and $1,200 in HOA fees
          for a total of $11,606 in annual operating expenses.
        </p>
        <h3 className="text-lg font-semibold text-gray-900">4. Calculate net operating income</h3>
        <p>{t("pages.whatIsCapRate.step4")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          $23,826 (effective income) – $11,606 (expenses) = $12,220 NOI
        </p>
        <h3 className="text-lg font-semibold text-gray-900">5. Apply the cap rate formula</h3>
        <p>
          Finally, divide NOI by the property&apos;s purchase price or current market value. If the
          property costs $250,000, the cap rate would be:
        </p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = $12,220 ÷ $250,000 ≈ 4.9%
        </p>
        <p>
          This means that if you bought the property in cash at $250,000, you would expect an
          annual return from operations of about 4.9% before financing.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whatIsCapRate.vsRoi")}</h2>
        <p>{t("pages.whatIsCapRate.vsRoiBody")}</p>
        <p>{t("pages.whatIsCapRate.vsRoiExample")}</p>
        <p>
          For a deeper analysis that includes financing and long-term returns, you can pair cap rate
          with cash-on-cash return or use tools like the{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}
          in CloseBoss.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whatIsCapRate.goodCapRate")}</h2>
        <p>{t("pages.whatIsCapRate.noSingleGood")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">3%–5%:</span>{t("pages.whatIsCapRate.lowRange")}</li>
          <li>
            <span className="font-semibold">5%–8%:</span>{t("pages.whatIsCapRate.midRange")}</li>
          <li>
            <span className="font-semibold">8%+:</span>{t("pages.whatIsCapRate.highRange")}</li>
        </ul>
        <p>{t("pages.whatIsCapRate.insteadOfChasing")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whatIsCapRate.affectsValue")}</h2>
        <p>{t("pages.whatIsCapRate.affectsValueBody")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Value = Net Operating Income (NOI) ÷ Market Cap Rate
        </p>
        <p>
          If similar properties in a market trade around a 5% cap rate and your NOI is $20,000, the
          indicated value would be $400,000. A lower market cap rate implies a higher value for the
          same NOI, while a higher market cap rate implies a lower value.
        </p>
        <p>{t("pages.whatIsCapRate.smallImprovements")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whatIsCapRate.mistakes")}</h2>
        <p>{t("pages.whatIsCapRate.mistakesIntro")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.whatIsCapRate.m1Label")}</span>{t("pages.whatIsCapRate.m1")}</li>
          <li>
            <span className="font-semibold">{t("pages.whatIsCapRate.m2Label")}</span>{t("pages.whatIsCapRate.m2")}</li>
          <li>
            <span className="font-semibold">{t("pages.whatIsCapRate.m3Label")}</span>{t("pages.whatIsCapRate.m3")}</li>
          <li>
            <span className="font-semibold">{t("pages.whatIsCapRate.m4Label")}</span>{t("pages.whatIsCapRate.m4")}</li>
        </ul>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.articleChrome.faqLong")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.whatIsCapRate.q1")}</h3>
        <p>{t("pages.whatIsCapRate.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.whatIsCapRate.q2")}</h3>
        <p>{t("pages.whatIsCapRate.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.whatIsCapRate.q3")}</h3>
        <p>{t("pages.whatIsCapRate.a3")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.whatIsCapRate.q4")}</h3>
        <p>{t("pages.whatIsCapRate.a4")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.whatIsCapRate.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.whatIsCapRate.ctaBody")}</p>
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

