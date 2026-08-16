"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function CapRateCalculatorHowToUseItPage() {
  const { t } = useTranslation("dashboard");
  const title = "Cap Rate Calculator: How to Use It";
  const url = "https://closebossai.com/cap-rate-calculator-how-to-use-it";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Learn how to use a cap rate calculator step by step to analyze rental properties quickly and accurately.",
          mainEntity: [
            {
              "@type": "Question",
              name: "How do you use a cap rate calculator?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "To use a cap rate calculator, enter your rental income, vacancy, operating expenses, and purchase price. The calculator will estimate net operating income (NOI) and divide it by the price to show the cap rate.",
              },
            },
            {
              "@type": "Question",
              name: "What information do I need for a cap rate calculator?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "You need estimated rent, additional income, vacancy rate, operating expenses (taxes, insurance, maintenance, utilities, management, HOA), and the property's purchase price or value.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateCalcHowTo.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateCalcHowTo.s1Title")}</h2>
        <p>{t("pages.capRateCalcHowTo.s1Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateCalcHowTo.s1i1")}</li>
          <li>{t("pages.capRateCalcHowTo.s1i2")}</li>
          <li>{t("pages.capRateCalcHowTo.s1i3")}</li>
          <li>{t("pages.capRateCalcHowTo.s1i4")}</li>
          <li>{t("pages.capRateCalcHowTo.s1i5")}</li>
        </ul>
        <p>{t("pages.capRateCalcHowTo.s1Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateCalcHowTo.s2Title")}</h2>
        <p>{t("pages.capRateCalcHowTo.s2Body")}</p>
        <p>{t("pages.capRateCalcHowTo.s2Tip")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateCalcHowTo.s3Title")}</h2>
        <p>{t("pages.capRateCalcHowTo.s3Body")}</p>
        <p>{t("pages.articleLinks.forExampleIn")}{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}{t("pages.articleLinks.onCloseBossEnter")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateCalcHowTo.s3i1")}</li>
          <li>{t("pages.capRateCalcHowTo.s3i2")}</li>
          <li>{t("pages.capRateCalcHowTo.s3i3")}</li>
        </ul>
        <p>{t("pages.capRateCalcHowTo.s3Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateCalcHowTo.s4Title")}</h2>
        <p>{t("pages.capRateCalcHowTo.s4Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateCalcHowTo.s4i1")}</li>
          <li>{t("pages.capRateCalcHowTo.s4i2")}</li>
          <li>{t("pages.capRateCalcHowTo.s4i3")}</li>
          <li>{t("pages.capRateCalcHowTo.s4i4")}</li>
          <li>{t("pages.capRateCalcHowTo.s4i5")}</li>
          <li>{t("pages.capRateCalcHowTo.s4i6")}</li>
        </ul>
        <p>{t("pages.capRateCalcHowTo.s4Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateCalcHowTo.s5Title")}</h2>
        <p>{t("pages.capRateCalcHowTo.s5Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateCalcHowTo.s5i1")}</li>
          <li>{t("pages.capRateCalcHowTo.s5i2")}</li>
          <li>{t("pages.capRateCalcHowTo.s5i3")}</li>
          <li>{t("pages.capRateCalcHowTo.s5i4")}</li>
        </ul>
        <p>{t("pages.articleLinks.inTheCloseBoss")}{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>
          , these outputs are displayed clearly so you can see both the underlying NOI and the final
          cap rate percentage.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateCalcHowTo.s6Title")}</h2>
        <p>{t("pages.capRateCalcHowTo.s6Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateCalcHowTo.s6i1")}</li>
          <li>{t("pages.capRateCalcHowTo.s6i2")}</li>
          <li>{t("pages.capRateCalcHowTo.s6i3")}</li>
        </ul>
        <p>{t("pages.capRateCalcHowTo.s6Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateCalcHowTo.s7Title")}</h2>
        <p>{t("pages.capRateCalcHowTo.s7Body")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Rent up or down by $100–$200 per month.</li>
          <li>{t("pages.capRateCalcHowTo.s7i1")}</li>
          <li>{t("pages.capRateCalcHowTo.s7i2")}</li>
          <li>{t("pages.capRateCalcHowTo.s7i3")}</li>
        </ul>
        <p>{t("pages.capRateCalcHowTo.s7Close")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateCalcHowTo.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateCalcHowTo.q1")}</h3>
        <p>{t("pages.capRateCalcHowTo.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateCalcHowTo.q2")}</h3>
        <p>{t("pages.capRateCalcHowTo.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateCalcHowTo.q3")}</h3>
        <p>{t("pages.articleLinks.sameCapRateMath")}{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}{t("pages.articleLinks.especiallyMultifamily")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateCalcHowTo.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateCalcHowTo.ctaBody")}</p>
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

