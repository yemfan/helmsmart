"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function CapRateForMultifamilyInvestmentsPage() {
  const { t } = useTranslation("dashboard");
  const title = "Cap Rate for Multifamily Investments";
  const url = "https://closebossai.com/cap-rate-for-multifamily-investments";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Understand how cap rate works for multifamily investments, how it differs by property size and class, and how to use it to underwrite apartment deals.",
          mainEntity: [
            {
              "@type": "Question",
              name: "How is cap rate used in multifamily investing?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "In multifamily investing, cap rate compares a building's net operating income (NOI) to its value and is a core metric for pricing, underwriting, and comparing apartment deals.",
              },
            },
            {
              "@type": "Question",
              name: "What is a good cap rate for multifamily?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "A good cap rate for multifamily depends on the market, property class, and risk profile. Prime Class A buildings in major metros may trade at 3%–5% caps, while smaller or older properties in secondary markets may trade at 5%–8% or higher.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateMultifamily.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMultifamily.s1Title")}</h2>
        <p>{t("pages.capRateMultifamily.s1a")}</p>
        <p>{t("pages.capRateMultifamily.s1b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMultifamily.s2Title")}</h2>
        <p>{t("pages.capRateMultifamily.s2a")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = Net Operating Income (NOI) ÷ Property Value
        </p>
        <p>{t("pages.capRateMultifamily.s2b")}</p>
        <p>{t("pages.capRateMultifamily.s2c")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMultifamily.s3Title")}</h2>
        <p>{t("pages.capRateMultifamily.s3Intro")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateMultifamily.classA")}</span> {t("pages.capRateMultifamily.classABody")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMultifamily.classB")}</span> {t("pages.capRateMultifamily.classBBody")}</li>
          <li>
            <span className="font-semibold">{t("pages.capRateMultifamily.classC")}</span> {t("pages.capRateMultifamily.classCBody")}</li>
        </ul>
        <p>{t("pages.capRateMultifamily.s3Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMultifamily.s4Title")}</h2>
        <p>{t("pages.capRateMultifamily.s4a")}</p>
        <p>{t("pages.capRateMultifamily.s4b")}</p>
        <p>{t("pages.capRateMultifamily.the")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}{t("pages.capRateMultifamily.standardize")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMultifamily.s5Title")}</h2>
        <p>{t("pages.capRateMultifamily.s5a")}</p>
        <p>
          For example, adding $50 per month in rent per unit across 40 units adds $24,000 of annual
          income. At a 6% cap rate, that extra NOI alone could support an additional $400,000 in
          value (because $24,000 ÷ 0.06 = $400,000).
        </p>
        <p>{t("pages.capRateMultifamily.s5b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateMultifamily.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateMultifamily.q1")}</h3>
        <p>{t("pages.capRateMultifamily.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateMultifamily.q2")}</h3>
        <p>{t("pages.capRateMultifamily.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateMultifamily.q3")}</h3>
        <p>{t("pages.capRateMultifamily.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateMultifamily.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateMultifamily.ctaBody")}</p>
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

