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
      <p className="text-gray-600 mb-8 max-w-3xl">
        Deciding whether to rent or buy is one of the biggest financial choices most
        people make. This guide shows you how to compare renting and owning side by
        side using realistic assumptions and the Rent vs Buy Calculator.
      </p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          1. Compare total out-of-pocket costs, not just payments
        </h2>
        <p>
          Many people compare their current rent to a potential mortgage payment and
          stop there. A better approach is to compare total out-of-pocket costs over
          your expected time horizon, including rent, down payment, closing costs,
          maintenance, and property taxes.
        </p>
        <p>
          The{" "}
          <Link
            href="/rent-vs-buy-calculator"
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >{t("pages.articleChrome.rentVsBuyCalculator")}</Link>{" "}
          helps you do this by estimating the total amount you would pay to rent versus
          own over a number of years.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          2. Choose a realistic time horizon
        </h2>
        <p>
          Renting can be more flexible in the short term, while buying often becomes
          more attractive the longer you stay. Think honestly about how long you expect
          to live in the home—three years, seven years, ten years—and run separate
          scenarios for each.
        </p>
        <p>
          The longer you own, the more your upfront costs (like closing fees and moving
          expenses) are spread out, and the more time you have for potential
          appreciation and principal paydown.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          3. Factor in maintenance, taxes, and opportunity cost
        </h2>
        <p>
          When you own, you are responsible for maintenance, repairs, property taxes,
          and insurance. When you rent, your landlord covers most of these costs, but
          you do not build equity. You should also consider the opportunity cost of the
          cash tied up in your down payment versus what it might earn elsewhere.
        </p>
        <p>
          Use the rent vs buy tool together with the{" "}
          <Link
            href="/mortgage-calculator"
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
          and{" "}
          <Link
            href="/hoa-fee-tracker"
            className="text-blue-600 hover:text-blue-700 font-semibold"
          >
            HOA Fee Tracker
          </Link>{" "}
          to build a more complete picture of ownership costs in your specific
          situation.
        </p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Run your own rent vs buy comparison
        </h2>
        <p className="mb-3">
          There is no one-size-fits-all answer. The right choice depends on your budget,
          job stability, lifestyle, and local market conditions. The key is to compare
          numbers side by side instead of relying on rules of thumb.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/rent-vs-buy-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >
            Open Rent vs Buy Calculator
          </Link>
          <Link
            href="/affordability-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >
            Open Affordability Calculator
          </Link>
        </div>
      </section>
    </div>
  );
}

