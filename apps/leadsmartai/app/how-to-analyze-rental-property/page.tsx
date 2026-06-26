"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";

export default function HowToAnalyzeRentalPropertyPage() {
  const title = "How to Analyze a Rental Property";
  const url = "https://realtybossai.com/how-to-analyze-rental-property";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          url,
          description:
            "Step-by-step framework for analyzing rental properties using cash flow, cap rate, NOI and ROI calculators.",
        }}
      />

      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Home
      </Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-3">
        {title}
      </h1>
      <p className="text-gray-600 mb-8 max-w-3xl">
        A solid rental property analysis helps you avoid bad deals and move quickly on
        great ones. This guide shows you how to evaluate income, expenses, financing,
        and returns using the calculators in RealtorBoss.
      </p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          1. Start with gross income and operating expenses
        </h2>
        <p>
          Begin by estimating realistic monthly rent and other income (parking, storage,
          pet fees). Then list out all operating expenses: property taxes, insurance,
          utilities you pay, HOA dues, maintenance, management fees, and an allowance
          for vacancy and repairs.
        </p>
        <p>
          Use the{" "}
          <Link href="/cash-flow-calculator" className="text-blue-600 hover:text-blue-700">
            Cash Flow Calculator
          </Link>{" "}
          to input these assumptions and see annual income, annual expenses, and
          resulting cash flow.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          2. Calculate NOI and cap rate
        </h2>
        <p>
          Net operating income (NOI) is your annual income minus annual operating
          expenses, before debt service. It is a key number lenders and investors use to
          compare deals. Divide NOI by the purchase price to get the capitalization
          rate, or cap rate.
        </p>
        <p>
          Plug the same income and expense assumptions into the{" "}
          <Link href="/cap-rate-calculator" className="text-blue-600 hover:text-blue-700">
            Cap Rate Calculator
          </Link>{" "}
          to see NOI and cap rate side by side. This helps you compare the property to
          other opportunities in your target market.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          3. Layer in financing and long‑term returns
        </h2>
        <p>
          Once a property looks good on an unlevered basis, analyze it with realistic
          loan terms. Use the{" "}
          <Link href="/mortgage-calculator" className="text-blue-600 hover:text-blue-700">
            Mortgage Calculator
          </Link>{" "}
          to understand your monthly principal and interest payment, then feed that into
          the{" "}
          <Link href="/property-investment-analyzer" className="text-blue-600 hover:text-blue-700">
            Property Investment Analyzer
          </Link>{" "}
          or{" "}
          <Link href="/roi-calculator" className="text-blue-600 hover:text-blue-700">
            ROI Calculator
          </Link>{" "}
          to see cash‑on‑cash ROI and long‑term equity growth.
        </p>
        <p>
          This step shows you how financing magnifies or reduces returns compared to
          buying all‑cash, and whether the property still meets your risk and return
          targets once debt service is included.
        </p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Analyze your next rental deal
        </h2>
        <p className="mb-3">
          Use this simple workflow on every property you consider: estimate income and
          expenses, calculate NOI and cap rate, then model financing and long‑term ROI.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/cash-flow-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
          >
            Open Cash Flow Calculator
          </Link>
          <Link
            href="/cap-rate-calculator"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >
            Open Cap Rate Calculator
          </Link>
          <Link
            href="/property-investment-analyzer"
            className="inline-flex items-center px-4 py-2 rounded-md text-sm font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50"
          >
            Open Investment Analyzer
          </Link>
        </div>
      </section>
    </div>
  );
}

