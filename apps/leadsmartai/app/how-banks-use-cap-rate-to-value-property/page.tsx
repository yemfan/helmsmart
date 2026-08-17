"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function HowBanksUseCapRateToValuePropertyPage() {
  const { t } = useTranslation("dashboard");
  const title = "How Banks Use Cap Rate to Value Property";
  const url = "https://closebossai.com/how-banks-use-cap-rate-to-value-property";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Learn how banks, appraisers, and lenders use cap rate and net operating income (NOI) to value income-producing properties and size loans.",
          mainEntity: [
            {
              "@type": "Question",
              name: "How do banks use cap rate to value property?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Banks and appraisers often use the income approach, dividing a property's net operating income (NOI) by a market cap rate to estimate value. That value then informs how much the bank is willing to lend.",
              },
            },
            {
              "@type": "Question",
              name: "Does a higher cap rate always mean the bank will lend more?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Not necessarily. Higher cap rates can indicate higher income, but they can also signal higher risk. Banks look at NOI, cap rate, loan-to-value (LTV), and debt service coverage ratio (DSCR) together when deciding how much to lend.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.banksCapRate.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.banksCapRate.s1Title")}</h2>
        <p>{t("pages.banksCapRate.s1a")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Value = Net Operating Income (NOI) ÷ Market Cap Rate
        </p>
        <p>{t("pages.banksCapRate.s1b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.banksCapRate.s2Title")}</h2>
        <p>
          Imagine a small apartment building with an appraiser-estimated NOI of $90,000 per year.
          Recent sales of similar buildings in the same area suggest a market cap rate of 6%.
        </p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Income-based value = $90,000 ÷ 0.06 = $1,500,000
        </p>
        <p>
          Even if the contract purchase price is $1,600,000, the lender may anchor on the
          appraiser&apos;s income-based value of $1,500,000 when deciding how much to lend. If the
          bank&apos;s maximum loan-to-value (LTV) is 75%, they might size the loan around:
        </p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Maximum loan ≈ 75% × $1,500,000 = $1,125,000
        </p>
        <p>{t("pages.banksCapRate.s2Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.banksCapRate.s3Title")}</h2>
        <p>{t("pages.banksCapRate.s3Intro")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.banksCapRate.ltv")}</span> {t("pages.banksCapRate.ltvBody")}</li>
          <li>
            <span className="font-semibold">{t("pages.banksCapRate.dscr")}</span> {t("pages.banksCapRate.dscrBody")}</li>
        </ul>
        <p>{t("pages.banksCapRate.s3Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.banksCapRate.s4Title")}</h2>
        <p>{t("pages.banksCapRate.s4Intro")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.banksCapRate.s4i1")}</li>
          <li>{t("pages.banksCapRate.s4i2")}</li>
          <li>{t("pages.banksCapRate.s4i3")}</li>
        </ul>
        <p>{t("pages.banksCapRate.s4a")}{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}{t("pages.banksCapRate.s4b")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}{t("pages.banksCapRate.s4c")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.banksCapRate.s5Title")}</h2>
        <p>{t("pages.banksCapRate.s5Body")}</p>
        <p>
          For example, increasing NOI from $90,000 to $105,000 at a 6% cap rate raises income-based
          value from $1,500,000 to $1,750,000. Banks take this into account when sizing refinance
          loans, and buyers consider it when making offers, because higher NOI at the same cap rate
          justifies a higher price.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.banksCapRate.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.banksCapRate.q1")}</h3>
        <p>{t("pages.banksCapRate.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.banksCapRate.q2")}</h3>
        <p>{t("pages.banksCapRate.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.banksCapRate.q3")}</h3>
        <p>{t("pages.banksCapRate.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.banksCapRate.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.banksCapRate.ctaBody")}</p>
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

