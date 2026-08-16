"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";
import { useTranslation } from "react-i18next";

export default function HowToCompareRentVsBuyPage() {
  const { t } = useTranslation("dashboard");
  const title = "How to Compare Renting vs Buying a Home";
  const url = "https://closebossai.com/how-to-compare-rent-vs-buy";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          url,
          description:
            "Learn how to compare the long-term cost of renting versus buying using realistic assumptions and the Rent vs Buy Calculator.",
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
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.compareRentVsBuy.intro")}</p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          1. Compare total out-of-pocket costs, not just payments
        </h2>
        <p>{t("pages.compareRentVsBuy.s1")}</p>
        <p>{t("pages.compareRentVsBuy.the")}{" "}
          <Link
            href="/rent-vs-buy-calculator"
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >{t("pages.articleChrome.rentVsBuyCalculator")}</Link>{" "}{t("pages.compareRentVsBuy.helpsYou")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          2. Choose a realistic time horizon
        </h2>
        <p>{t("pages.compareRentVsBuy.s2")}</p>
        <p>{t("pages.compareRentVsBuy.s2b")}</p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          3. Factor in maintenance, taxes, and opportunity cost
        </h2>
        <p>{t("pages.compareRentVsBuy.s3")}</p>
        <p>{t("pages.compareRentVsBuy.useTogether")}{" "}
          <Link
            href="/mortgage-calculator"
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
          and{" "}
          <Link
            href="/hoa-fee-tracker"
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >{t("pages.compareRentVsBuy.hoaTracker")}</Link>{" "}{t("pages.compareRentVsBuy.completePicture")}</p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.compareRentVsBuy.ctaTitle")}</h2>
        <p className="mb-3">{t("pages.compareRentVsBuy.ctaBody")}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/rent-vs-buy-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >{t("pages.compareRentVsBuy.openRentVsBuy")}</Link>
          <Link
            href="/affordability-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >{t("pages.compareRentVsBuy.openAffordability")}</Link>
        </div>
      </section>
    </div>
  );
}

