"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function WhyCapRateMattersForRealEstateInvestorsPage() {
  const { t } = useTranslation("dashboard");
  const title = "Why Cap Rate Matters for Real Estate Investors";
  const url = "https://closebossai.com/why-cap-rate-matters-for-real-estate-investors";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Learn why cap rate is such an important metric for real estate investors, how it helps compare deals, price risk, and make smarter buy-and-hold decisions.",
          mainEntity: [
            {
              "@type": "Question",
              name: "Why is cap rate important in real estate investing?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rate is important because it shows how much income a property produces relative to its value, making it easier to compare deals, price risk, and estimate value using net operating income (NOI).",
              },
            },
            {
              "@type": "Question",
              name: "Can I invest successfully without using cap rate?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "While it's possible, ignoring cap rate means you may struggle to compare deals objectively or recognize when you're overpaying for income. Most professional investors rely on cap rates as a core part of their analysis.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.whyCapRateMatters.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whyCapRateMatters.s1Title")}</h2>
        <p>{t("pages.whyCapRateMatters.s1a")}</p>
        <p>{t("pages.whyCapRateMatters.s1b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whyCapRateMatters.s2Title")}</h2>
        <p>{t("pages.whyCapRateMatters.s2a")}</p>
        <p>{t("pages.whyCapRateMatters.s2b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whyCapRateMatters.s3Title")}</h2>
        <p>{t("pages.whyCapRateMatters.s3a")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Value = Net Operating Income (NOI) ÷ Market Cap Rate
        </p>
        <p>{t("pages.whyCapRateMatters.s3b")}</p>
        <p>{t("pages.whyCapRateMatters.toolsLike")}{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}{t("pages.whyCapRateMatters.toolsLikeTail")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whyCapRateMatters.s4Title")}</h2>
        <p>{t("pages.whyCapRateMatters.s4Intro")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.whyCapRateMatters.unusuallyLow")}</span> {t("pages.whyCapRateMatters.unusuallyLowBody")}</li>
          <li>
            <span className="font-semibold">{t("pages.whyCapRateMatters.unusuallyHigh")}</span> {t("pages.whyCapRateMatters.unusuallyHighBody")}</li>
        </ul>
        <p>{t("pages.whyCapRateMatters.s4Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whyCapRateMatters.s5Title")}</h2>
        <p>{t("pages.whyCapRateMatters.s5Intro")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.whyCapRateMatters.pairWith")}{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.whyCapRateMatters.cocLink")}</Link>{" "}{t("pages.whyCapRateMatters.pairWithTail")}</li>
          <li>{t("pages.whyCapRateMatters.withRoiIrr")}</li>
          <li>{t("pages.whyCapRateMatters.withLender")}</li>
        </ul>
        <p>{t("pages.whyCapRateMatters.the")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}{t("pages.whyCapRateMatters.inCloseBoss")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.whyCapRateMatters.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.whyCapRateMatters.q1")}</h3>
        <p>{t("pages.whyCapRateMatters.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.whyCapRateMatters.q2")}</h3>
        <p>{t("pages.whyCapRateMatters.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.whyCapRateMatters.q3")}</h3>
        <p>{t("pages.whyCapRateMatters.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.whyCapRateMatters.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.whyCapRateMatters.ctaBody")}</p>
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

