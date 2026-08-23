"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function HowCapRateAffectsPropertyValuePage() {
  const { t } = useTranslation("dashboard");
  const title = "How Cap Rate Affects Property Value in Real Estate Investing";
  const url = "https://closebossai.com/how-cap-rate-affects-property-value";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Understand how cap rate affects property value, why small changes in net operating income (NOI) or market cap rates can create big value swings, and how investors can use this to their advantage.",
          mainEntity: [
            {
              "@type": "Question",
              name: "How does cap rate impact property value?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Property value using the income approach is calculated as net operating income (NOI) divided by the market cap rate. A lower cap rate increases value for the same NOI, while a higher cap rate reduces value.",
              },
            },
            {
              "@type": "Question",
              name: "Can small changes in cap rate really move value a lot?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Because value is NOI divided by cap rate, even a 0.5% or 1% shift in cap rate can result in a large change in value, especially on higher-priced properties.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateValue.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateValue.s1Title")}</h2>
        <p>{t("pages.capRateValue.s1a")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Value = Net Operating Income (NOI) ÷ Market Cap Rate
        </p>
        <p>{t("pages.capRateValue.s1b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateValue.ex1Title")}</h2>
        <p>
          Consider a property that produces $50,000 in NOI per year. If the market cap rate for
          similar assets is 6%, the indicated value using the income approach is:
        </p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Value = $50,000 ÷ 0.06 ≈ $833,333
        </p>
        <p>{t("pages.capRateValue.ex1Body")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Value = $50,000 ÷ 0.055 ≈ $909,091
        </p>
        <p>
          That is a value increase of more than $75,000 just from a 0.5% change in the market cap
          rate. The property&apos;s NOI did not change at all; only investor expectations and market
          pricing moved.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateValue.ex2Title")}</h2>
        <p>
          Now imagine the same market where 6% is still the typical cap rate, but you improve the
          property&apos;s operations. Through better management, slight rent increases, and tighter
          control of expenses, you raise NOI from $50,000 to $55,000.
        </p>
        <p>{t("pages.capRateValue.ex2Body")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Value = $55,000 ÷ 0.06 ≈ $916,667
        </p>
        <p>
          That is an increase of more than $83,000 in value from an extra $5,000 of annual NOI. In
          other words, each additional $1 in stable NOI created roughly $16.67 in value at a 6% cap
          rate. This leverage effect is why many investors focus heavily on improving NOI.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateValue.s2Title")}</h2>
        <p>{t("pages.capRateValue.s2a")}</p>
        <p>{t("pages.capRateValue.s2b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateValue.s3Title")}</h2>
        <p>{t("pages.capRateValue.s3Intro")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateValue.lever1")}</span> {t("pages.capRateValue.lever1Body")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateValue.lever2")}</span> {t("pages.capRateValue.lever2Body")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateValue.lever3")}</span> {t("pages.capRateValue.lever3Body")}</li>
        </ul>
        <p>{t("pages.capRateValue.toolsLike")}{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}
          {t("common:conjunctions.and")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}{t("pages.capRateValue.toolsLikeTail")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.articleChrome.faqLong")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateValue.q1")}</h3>
        <p>{t("pages.capRateValue.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateValue.q2")}</h3>
        <p>{t("pages.capRateValue.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateValue.q3")}</h3>
        <p>{t("pages.capRateValue.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateValue.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateValue.ctaBody")}</p>
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

