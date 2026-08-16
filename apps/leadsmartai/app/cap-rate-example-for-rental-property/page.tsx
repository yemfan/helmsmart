"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function CapRateExampleForRentalPropertyPage() {
  const { t } = useTranslation("dashboard");
  const title = "Cap Rate Example for Rental Property";
  const url = "https://closebossai.com/cap-rate-example-for-rental-property";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Walk through a complete cap rate example for a rental property, from income and expenses to NOI, cap rate, and how to interpret the results.",
          mainEntity: [
            {
              "@type": "Question",
              name: "How do you calculate cap rate for a rental property?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "To calculate cap rate, estimate the property's net operating income (NOI) by subtracting operating expenses from effective income, then divide NOI by the property's purchase price or value.",
              },
            },
            {
              "@type": "Question",
              name: "What does a cap rate number tell you about a rental?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rate tells you the rental property's annual income yield relative to its value, assuming an all-cash purchase. It helps you compare deals and understand whether the income justifies the price.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateExample.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateExample.s1Title")}</h2>
        <p>
          Imagine a 3-bedroom rental house in a stable suburban neighborhood. The seller is asking
          $320,000. Similar homes in the area rent for about $2,300 per month, and the property
          taxes, insurance, and other expenses are typical for the market.
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Asking price: $320,000</li>
          <li>Expected monthly rent: $2,300</li>
          <li>{t("pages.capRateExample.s1Note")}</li>
        </ul>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateExample.s2Title")}</h2>
        <p>{t("pages.capRateExample.s2Body")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Gross annual rent = $2,300 × 12 = $27,600
        </p>
        <p>{t("pages.capRateExample.s2Assume")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Vacancy allowance = 5% of $27,600 = $1,380
          <br />
          Effective rental income = $27,600 – $1,380 = $26,220
        </p>
        <p>
          If the property has any additional income (for example, $50/month for a parking space),
          add that to the effective income figure.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateExample.s3Title")}</h2>
        <p>{t("pages.capRateExample.s3Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Property taxes: $4,800 per year</li>
          <li>Landlord insurance: $1,400 per year</li>
          <li>Maintenance &amp; repairs (budget): $1,800 per year</li>
          <li>Lawn care and snow removal: $900 per year</li>
          <li>Property management (8% of effective income): 0.08 × $26,220 ≈ $2,098</li>
        </ul>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Total operating expenses ≈ $4,800 + $1,400 + $1,800 + $900 + $2,098
          <br />
          Total operating expenses ≈ $10,998
        </p>
        <p>{t("pages.capRateExample.s3Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateExample.s4Title")}</h2>
        <p>{t("pages.capRateExample.s4Body")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          NOI = Effective income – Operating expenses
          <br />
          NOI ≈ $26,220 – $10,998 = $15,222
        </p>
        <p>
          This $15,222 represents the property&apos;s annual income from operations before any debt
          service or income taxes. It is the key input for the cap rate formula.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateExample.s5Title")}</h2>
        <p>{t("pages.capRateExample.s5Body")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = NOI ÷ Price
          <br />
          Cap Rate ≈ $15,222 ÷ $320,000 ≈ 0.0476, or about 4.8%
        </p>
        <p>
          At the asking price of $320,000, this rental property has an approximate cap rate of 4.8%.
          This is the income yield you&apos;d earn if you bought the property all-cash at that
          price, before financing.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateExample.s6Title")}</h2>
        <p>{t("pages.capRateExample.s6Body")}</p>
        <p>{t("pages.capRateExample.s6Ask")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateExample.s6i1")}</li>
          <li>{t("pages.capRateExample.s6i2")}</li>
          <li>{t("pages.capRateExample.s6i3")}</li>
        </ul>
        <p>{t("pages.capRateExample.s6Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateExample.s7Title")}</h2>
        <p>{t("pages.capRateExample.s7Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>What if you negotiate the price down to $300,000?</li>
          <li>What if you raise rent to $2,450 over the first year to match nearby comps?</li>
          <li>{t("pages.capRateExample.s7i1")}</li>
        </ul>
        <p>
          You can quickly model these changes in the{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}
          and{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}
          to see how they impact NOI, cap rate, and overall returns.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateExample.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateExample.q1")}</h3>
        <p>{t("pages.capRateExample.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateExample.q2")}</h3>
        <p>{t("pages.capRateExample.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateExample.q3")}</h3>
        <p>{t("pages.capRateExample.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateExample.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateExample.ctaBody")}</p>
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

