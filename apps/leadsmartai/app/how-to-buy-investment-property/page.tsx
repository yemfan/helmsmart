"use client";

import Link from "next/link";
import JsonLd from "../../components/JsonLd";

export default function HowToBuyInvestmentPropertyPage() {
  const title = "How to Buy an Investment Property";
  const url = "https://realtybossai.com/how-to-buy-investment-property";

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          url,
          description:
            "Step-by-step guide for buying your first investment property, including analysis, financing, and using real estate calculators.",
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
        Buying an investment property is very different from buying a primary residence.
        This guide walks through a simple, repeatable process you can use to find,
        analyze, and finance rental properties using the calculators in RealtyBoss.
      </p>

      <section className="max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          1. Define your investment goals
        </h2>
        <p>
          Before you look at any listings, get clear on what you want the property to
          do for you. Are you optimizing for cash flow, long‑term appreciation, tax
          benefits, or a mix of all three? Your goals will determine what markets,
          property types, and price ranges make sense.
        </p>
        <p>
          A cash‑flow focused investor might favor smaller, more affordable homes or
          duplexes in strong rental areas. An appreciation‑driven investor might accept
          thinner cash flow in exchange for being in a premium, supply‑constrained
          location.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          2. Run quick numbers on potential deals
        </h2>
        <p>
          As you browse listings, plug rough numbers into these tools to screen deals:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <Link
              href="/cash-flow-calculator"
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Cash Flow Calculator
            </Link>{" "}
            – estimate monthly and annual cash flow after mortgage and expenses.
          </li>
          <li>
            <Link
              href="/cap-rate-calculator"
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Cap Rate Calculator
            </Link>{" "}
            – compare NOI to purchase price to see if the property meets your return
            thresholds.
          </li>
          <li>
            <Link
              href="/property-investment-analyzer"
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Property Investment Analyzer
            </Link>{" "}
            – combine cash flow, NOI, cap rate, and simple cash‑on‑cash ROI in one view.
          </li>
        </ul>
        <p>
          These calculators help you quickly eliminate properties that obviously do not
          work on paper, so you can focus your time on a smaller set of promising deals.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          3. Stress‑test financing and expenses
        </h2>
        <p>
          Once you find a property that looks promising, stress‑test it with different
          interest rates, down payments, and expense assumptions. Use the{" "}
          <Link href="/mortgage-calculator" className="text-blue-600 hover:text-blue-700">
            Mortgage Calculator
          </Link>{" "}
          to see how your payment changes if rates move up or down, and adjust property
          taxes, insurance, maintenance, and vacancy in the cash‑flow tools.
        </p>
        <p>
          Aim for a margin of safety: the deal should still make sense if rents are a
          bit lower, expenses are a bit higher, or interest rates change before you
          lock your loan.
        </p>
      </section>

      <section className="mt-8 max-w-3xl space-y-4 text-sm text-gray-800">
        <h2 className="text-xl font-semibold text-gray-900">
          4. Work with local professionals
        </h2>
        <p>
          Calculators are powerful for screening and comparing deals, but successful
          investing also depends on local knowledge. Partner with an agent, lender, and
          property manager who understand rents, tenant expectations, and typical
          expenses in your market.
        </p>
        <p>
          Bring your calculator outputs to these conversations. They help you ask
          better questions and validate assumptions before you submit offers or commit
          to financing.
        </p>
      </section>

      <section className="mt-10 max-w-3xl border-t border-gray-200 pt-4 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Next steps
        </h2>
        <p className="mb-3">
          Ready to analyze your first or next investment property? Start by running a
          few scenarios in the calculators below:
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

