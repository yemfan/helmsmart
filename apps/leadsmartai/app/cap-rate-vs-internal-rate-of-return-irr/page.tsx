"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function CapRateVsInternalRateOfReturnIRRPage() {
  const { t } = useTranslation("dashboard");
  const title = "Cap Rate vs Internal Rate of Return (IRR)";
  const url = "https://closebossai.com/cap-rate-vs-internal-rate-of-return-irr";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Article", "FAQPage"],
          headline: title,
          url,
          description:
            "Learn the difference between cap rate and internal rate of return (IRR), how each metric is calculated, and when real estate investors should use them.",
          mainEntity: [
            {
              "@type": "Question",
              name: "What is the difference between cap rate and IRR?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Cap rate measures a property's current income relative to value using net operating income (NOI), while internal rate of return (IRR) measures the annualized total return on invested capital over time, including cash flow and sale proceeds.",
              },
            },
            {
              "@type": "Question",
              name: "When should I use cap rate vs IRR?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Use cap rate to compare properties and screen deals based on current income. Use IRR to evaluate full investment performance over a holding period, including cash flow, debt paydown, and exit value.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.capRateVsIrr.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.articleChrome.whatIsCapRate")}</h2>
        <p>{t("pages.capRateVsIrr.capDef")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = Net Operating Income (NOI) ÷ Purchase Price or Value
        </p>
        <p>{t("pages.capRateVsIrr.capUse")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsIrr.irrTitle")}</h2>
        <p>{t("pages.capRateVsIrr.irrDef")}</p>
        <p>{t("pages.capRateVsIrr.irrPractical")}</p>
        <p>{t("pages.capRateVsIrr.irrIncludes")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateVsIrr.irr1")}</li>
          <li>{t("pages.capRateVsIrr.irr2")}</li>
          <li>{t("pages.capRateVsIrr.irr3")}</li>
        </ul>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsIrr.snapshotTitle")}</h2>
        <p>{t("pages.capRateVsIrr.snapshotBody")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <span className="font-semibold">{t("pages.capRateVsIrr.capLabel")}</span> Year-one NOI ÷ price, no financing, no
            sale.
          </li>
          <li>
            <span className="font-semibold">{t("pages.capRateVsIrr.irrLabel")}</span>{t("pages.capRateVsIrr.irrBullet")}</li>
        </ul>
        <p>{t("pages.capRateVsIrr.becauseIrr")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsIrr.exampleTitle")}</h2>
        <p>{t("pages.capRateVsIrr.exampleBody")}</p>
        <p>{t("pages.capRateVsIrr.exampleYear1")}</p>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateVsIrr.exA")}</li>
          <li>{t("pages.capRateVsIrr.exB")}</li>
        </ul>
        <p>{t("pages.capRateVsIrr.exampleClose")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsIrr.whenTitle")}</h2>
        <p>{t("pages.capRateVsIrr.whenBody")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsIrr.capBestFor")}</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateVsIrr.cb1")}</li>
          <li>{t("pages.capRateVsIrr.cb2")}</li>
          <li>{t("pages.capRateVsIrr.cb3")}</li>
        </ul>
        <h3 className="text-lg font-semibold text-gray-900 mt-4">{t("pages.capRateVsIrr.irrBestFor")}</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>{t("pages.capRateVsIrr.ib1")}</li>
          <li>{t("pages.capRateVsIrr.ib2")}</li>
          <li>{t("pages.capRateVsIrr.ib3")}</li>
        </ul>
        <p>
          A common workflow is to use cap rate and cash-on-cash return to narrow the field, then run
          detailed IRR projections for the top contenders using tools like the{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.propertyAnalyzer")}</Link>
          .
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800 border-t border-gray-200 pt-6">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateVsIrr.faqTitle")}</h2>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsIrr.q1")}</h3>
        <p>{t("pages.capRateVsIrr.a1")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsIrr.q2")}</h3>
        <p>{t("pages.capRateVsIrr.a2")}</p>
        <h3 className="text-lg font-semibold text-gray-900">{t("pages.capRateVsIrr.q3")}</h3>
        <p>{t("pages.capRateVsIrr.a3")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.capRateVsIrr.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.capRateVsIrr.ctaBody")}</p>
        <div className="flex flex-wrap gap-3 mb-4">
          <Link
            href="/cap-rate-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >{t("pages.articleChrome.openCapRate")}</Link>
          <Link
            href="/roi-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.capRateVsIrr.openRoiIrr")}</Link>
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

