"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function HowToCalculateCapRatePage() {
  const { t } = useTranslation("dashboard");
  const title = "How to Calculate Cap Rate";
  const url = "https://closebossai.com/how-to-calculate-cap-rate";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          url,
          description:
            "Learn how to calculate cap rate for rental properties using net operating income (NOI) and purchase price.",
        }}
      />

      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-3">
        {title}
      </h1>
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.howToGuides.calcIntro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("pages.howToGuides.calcStep1Title")}
        </h2>
        <p>{t("pages.howToGuides.calcNoi")}</p>
        <p>
          For example, if a property generates $30,000 in rent per year and you spend
          $10,000 on operating expenses, your NOI is $20,000.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("pages.howToGuides.calcStep2Title")}
        </h2>
        <p>{t("pages.howToGuides.calcFormula")}</p>
        <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded-md p-3">
          Cap Rate = NOI ÷ Purchase Price
        </p>
        <p>
          If your NOI is $20,000 and the property costs $300,000, the cap rate is
          about 6.67% ($20,000 ÷ $300,000). Higher cap rates typically indicate higher
          potential returns and higher risk, while lower cap rates are more common in
          premium, supply‑constrained markets.
        </p>
        <p>{t("pages.howToGuides.calcRunInstantly")}{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.capRateCalculator")}</Link>{" "}{t("pages.howToGuides.calcByEntering")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("pages.howToGuides.calcStep3Title")}
        </h2>
        <p>
          Cap rate is most useful for comparing properties to each other, not for
          predicting exact returns. It does not include financing, income taxes, or
          long‑term appreciation, and it assumes your expense and rent estimates are
          accurate.
        </p>
        <p>
          Use the cap rate as a first‑pass filter: for example, you might only consider
          properties at 6% cap rate or higher in a given market. Then use deeper tools
          such as the{" "}
          <Link
            href="/property-investment-analyzer"
            className="text-blue-600 hover:text-blue-700"
          >{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}
          or{" "}
          <Link href="/roi-calculator" className="text-blue-600 hover:text-blue-700">{t("pages.articleChrome.roiCalculator")}</Link>{" "}
          to model financing and long‑term returns.
        </p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.howToGuides.calcCtaTitle")}</h2>
        <p className="mb-3">{t("pages.howToGuides.calcCtaBody")}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/cap-rate-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >{t("pages.articleChrome.openCapRate")}</Link>
          <Link
            href="/cap-rate-roi-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.howToGuides.openCapRoi")}</Link>
        </div>
      </section>
    </div>
  );
}

