"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";

export default function CapRateCalculator() {
  const [purchasePrice, setPurchasePrice] = useState<number>(400000);
  const [annualRent, setAnnualRent] = useState<number>(28800);
  const [vacancyRate, setVacancyRate] = useState<number>(5);
  const [propertyTax, setPropertyTax] = useState<number>(4800);
  const [insurance, setInsurance] = useState<number>(1200);
  const [maintenance, setMaintenance] = useState<number>(2400);
  const [otherExpenses, setOtherExpenses] = useState<number>(1200);

  const results = useMemo(() => {
    const effectiveIncome = annualRent * (1 - vacancyRate / 100);
    const totalExpenses =
      propertyTax + insurance + maintenance + otherExpenses;
    const noi = effectiveIncome - totalExpenses;
    const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;
    return {
      noi,
      capRate,
      effectiveIncome,
      totalExpenses,
    };
  }, [
    purchasePrice,
    annualRent,
    vacancyRate,
    propertyTax,
    insurance,
    maintenance,
    otherExpenses,
  ]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Cap Rate Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/cap-rate-calculator",
          description:
            "Calculate cap rate for real estate investments from net operating income and purchase price.",
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

      <h1 className="text-3xl font-bold text-blue-600 mb-2">Cap Rate Calculator</h1>
      <p className="text-gray-600 mb-8">
        Calculate capitalization rate from NOI and purchase price.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Property & income</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Purchase price ($)" value={purchasePrice} onChange={setPurchasePrice} min={1000} />
              <InputField label="Annual rent ($)" value={annualRent} onChange={setAnnualRent} min={0} />
              <InputField label="Vacancy rate (%)" value={vacancyRate} onChange={setVacancyRate} min={0} max={50} step={1} />
              <InputField label="Property tax ($/yr)" value={propertyTax} onChange={setPropertyTax} min={0} />
              <InputField label="Insurance ($/yr)" value={insurance} onChange={setInsurance} min={0} />
              <InputField label="Maintenance ($/yr)" value={maintenance} onChange={setMaintenance} min={0} />
              <InputField label="Other expenses ($/yr)" value={otherExpenses} onChange={setOtherExpenses} min={0} />
            </div>
            <div className="pt-2">
              <button
                type="button"
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Calculate
              </button>
            </div>
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <ResultCard
              title="Cap rate"
              value={`${results.capRate.toFixed(2)}%`}
              details={`NOI: $${results.noi.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nEffective income: $${results.effectiveIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nTotal expenses: $${results.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nCap rate: ${results.capRate.toFixed(2)}%`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">
          What is a good cap rate?
        </h2>
        <p>
          The cap rate calculator converts net operating income (NOI) and purchase price
          into a capitalization rate, a core metric for comparing rental investments. It
          adjusts for vacancy and common operating expenses to approximate stabilized
          NOI.
        </p>
        <p>
          Investors and brokers can use this tool to benchmark properties against local
          market cap rates and risk profiles. Higher cap rates often indicate more risk
          and potentially higher returns, while lower cap rates are typical in premium,
          supply-constrained locations.
        </p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">
          People also ask about cap rate
        </h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            What is cap rate and why is it important?
          </h3>
          <p className="text-gray-600">
            Cap rate, or capitalization rate, is a ratio of a property&apos;s net operating income
            to its purchase price or value, expressed as a percentage.
            It is important because it helps investors quickly compare the income potential and
            risk profile of different properties. You can calculate it instantly with this{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">
              Cap Rate Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How do I calculate net operating income (NOI) for cap rate?
          </h3>
          <p className="text-gray-600">
            To calculate NOI, subtract all reasonable operating expenses—such as taxes, insurance,
            maintenance, and management—from your effective rental income, but do not subtract
            mortgage payments.
            This calculator helps you estimate NOI and cap rate at the same time, and you can
            analyze detailed cash flow with our{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">
              Cash Flow Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            Is a higher cap rate always better for investors?
          </h3>
          <p className="text-gray-600">
            A higher cap rate is not always better, because it often reflects higher risk, weaker
            locations, or more intensive management.
            Lower cap rates are typical in strong, supply-constrained markets where investors are
            willing to accept lower yields for more stability. You can compare cap rates across
            deals and then analyze overall returns with our{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">
              Property Investment Analyzer
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How does financing affect cap rate and my real return?
          </h3>
          <p className="text-gray-600">
            Traditional cap rate calculations ignore financing and are based only on NOI and
            purchase price, but your real return also depends on your loan terms and cash invested.
            To see the full picture, combine cap rate from this tool with cash-on-cash and ROI
            metrics from our{" "}
            <Link href="/roi-calculator" className="text-blue-600 underline">
              ROI Calculator
            </Link>{" "}
            and{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">
              Property Investment Analyzer
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            What is a good cap rate for my market?
          </h3>
          <p className="text-gray-600">
            A &quot;good&quot; cap rate depends on your market, asset type, and risk tolerance—core
            properties in top-tier markets often trade at lower cap rates, while value-add deals in
            secondary markets show higher caps.
            Use this calculator to evaluate individual properties and compare them to recent sales
            or broker guidance. Then check projected cash flow with our{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">
              Cash Flow Calculator
            </Link>
            .
          </p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">Related Calculators</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">
              Cash Flow Calculator
            </Link>
            <Link href="/roi-calculator" className="text-blue-600 underline">
              ROI Calculator
            </Link>
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">
              Investment Analyzer
            </Link>
            <Link href="/mortgage-calculator" className="text-blue-600 underline">
              Mortgage Calculator
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
