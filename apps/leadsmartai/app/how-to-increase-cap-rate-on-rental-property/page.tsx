"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function HowToIncreaseCapRateOnRentalPropertyPage() {
  const { t } = useTranslation("dashboard");
  const title = "How to Increase Cap Rate on Rental Property";
  const url = "https://closebossai.com/how-to-increase-cap-rate-on-rental-property";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Learn practical strategies to increase cap rate on rental properties by boosting net operating income (NOI) and optimizing expenses without sacrificing long-term value.",
          mainEntity: [
            {
              "@type": "Question",
              name: "How can I increase the cap rate on my rental property?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "You can increase cap rate by growing net operating income (NOI)—raising rents to market, adding new income streams, and reducing controllable expenses—relative to the property's value.",
              },
            },
            {
              "@type": "Question",
              name: "Is it always smart to focus on a higher cap rate?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Not always. While higher cap rates mean more income per dollar of value, pushing rents too far or cutting essential expenses can hurt tenant quality and long-term value. Balance income improvements with property condition and market expectations.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.increaseCapRate.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.increaseCapRate.formulasTitle")}</h2>
        <p>{t("pages.increaseCapRate.formulasBody")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = NOI ÷ Property Value
        </p>
        <p>{t("pages.increaseCapRate.noiBody")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.increaseCapRate.s1Title")}</h2>
        <p>{t("pages.increaseCapRate.s1Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.increaseCapRate.s1i1")}</li>
          <li>{t("pages.increaseCapRate.s1i2")}</li>
          <li>{t("pages.increaseCapRate.s1i3")}</li>
        </ul>
        <p>{t("pages.articleLinks.modestRentIncreases")}{" "}
          <Link href="/cash-flow-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}{t("pages.articleLinks.toSeeRentScenarios")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.increaseCapRate.s2Title")}</h2>
        <p>{t("pages.increaseCapRate.s2Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.increaseCapRate.s2i1")}</li>
          <li>{t("pages.increaseCapRate.s2i2")}</li>
          <li>{t("pages.increaseCapRate.s2i3")}</li>
          <li>{t("pages.increaseCapRate.s2i4")}</li>
        </ul>
        <p>{t("pages.articleLinks.lowIncrementalExpenses")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}{t("pages.articleLinks.cumulativeEffect")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.increaseCapRate.s3Title")}</h2>
        <p>{t("pages.increaseCapRate.s3Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.increaseCapRate.s3i1")}</li>
          <li>{t("pages.increaseCapRate.s3i2")}</li>
          <li>{t("pages.increaseCapRate.s3i3")}</li>
          <li>{t("pages.increaseCapRate.s3i4")}</li>
        </ul>
        <p>{t("pages.increaseCapRate.s3Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.increaseCapRate.s4Title")}</h2>
        <p>{t("pages.increaseCapRate.s4Body")}</p>
        <p>
          The goal is to spend $1 in capital to create more than $1 of value via higher NOI. At a
          6% market cap rate, every additional $1 of stable NOI can translate to roughly $16–$17 of
          value. Well-planned value-add projects can therefore increase both cap rate and equity.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.increaseCapRate.s5Title")}</h2>
        <p>{t("pages.increaseCapRate.s5Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.increaseCapRate.s5i1")}</li>
          <li>{t("pages.increaseCapRate.s5i2")}</li>
          <li>{t("pages.increaseCapRate.s5i3")}</li>
        </ul>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.increaseCapRate.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.increaseCapRate.q1")}</h3>
        <p>{t("pages.increaseCapRate.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.increaseCapRate.q2")}</h3>
        <p>{t("pages.increaseCapRate.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.increaseCapRate.q3")}</h3>
        <p>{t("pages.articleLinks.improvementsOverYears")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}{t("pages.articleLinks.realisticExpectations")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.increaseCapRate.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.increaseCapRate.ctaBody")}</p>
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

