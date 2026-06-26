"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";

function pmt(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export default function RentVsBuyCalculator() {
  const [monthlyRent, setMonthlyRent] = useState<number>(2000);
  const [homePrice, setHomePrice] = useState<number>(400000);
  const [downPayment, setDownPayment] = useState<number>(80000);
  const [mortgageRate, setMortgageRate] = useState<number>(6.5);
  const [propertyTaxRate, setPropertyTaxRate] = useState<number>(1.2);
  const [expectedAppreciation, setExpectedAppreciation] = useState<number>(3);
  const [yearsToStay, setYearsToStay] = useState<number>(5);

  const { totalCostRenting, totalCostBuying, recommendation } = useMemo(() => {
    const totalCostRenting = monthlyRent * 12 * yearsToStay;
    const loanAmount = Math.max(0, homePrice - downPayment);
    const monthlyPmt = pmt(loanAmount, mortgageRate, 30);
    const annualPropertyTax = (homePrice * propertyTaxRate) / 100;
    const totalCostBuying =
      downPayment + monthlyPmt * 12 * yearsToStay + annualPropertyTax * yearsToStay;
    const recommendation = totalCostRenting < totalCostBuying ? "Rent" : "Buy";
    return {
      totalCostRenting,
      totalCostBuying,
      recommendation,
    };
  }, [
    monthlyRent,
    homePrice,
    downPayment,
    mortgageRate,
    propertyTaxRate,
    yearsToStay,
  ]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Rent vs Buy Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://realtybossai.com/rent-vs-buy-calculator",
          description:
            "Compare the total cost of renting versus buying a home over your planned time horizon.",
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

      <h1 className="text-3xl font-bold text-blue-600 mb-2">Rent vs Buy Calculator</h1>
      <p className="text-gray-600 mb-8">
        Compare total costs over your planned stay. Buying builds equity; this compares out-of-pocket costs.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Assumptions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                label="Monthly rent ($)"
                value={monthlyRent}
                onChange={setMonthlyRent}
                min={0}
              />
              <InputField
                label="Home price ($)"
                value={homePrice}
                onChange={setHomePrice}
                min={1000}
              />
              <InputField
                label="Down payment ($)"
                value={downPayment}
                onChange={setDownPayment}
                min={0}
              />
              <InputField
                label="Mortgage rate (%)"
                value={mortgageRate}
                onChange={setMortgageRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField
                label="Property tax rate (% per year)"
                value={propertyTaxRate}
                onChange={setPropertyTaxRate}
                min={0}
                max={10}
                step={0.1}
              />
              <InputField
                label="Expected appreciation (% per year)"
                value={expectedAppreciation}
                onChange={setExpectedAppreciation}
                min={-5}
                max={20}
                step={0.5}
              />
              <InputField
                label="Years planning to stay"
                value={yearsToStay}
                onChange={setYearsToStay}
                min={1}
                max={30}
              />
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
              title="Comparison"
              value={recommendation}
              details={`Total cost renting (${yearsToStay} yrs): $${totalCostRenting.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nTotal cost buying (${yearsToStay} yrs): $${totalCostBuying.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nRecommendation: ${recommendation}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">
          Decide whether to rent or buy
        </h2>
        <p>
          This rent vs buy calculator compares the total cost of renting to the total
          cost of owning over your expected time horizon. It considers rent, home price,
          down payment, mortgage rate, property taxes, and how long you plan to stay in
          the property.
        </p>
        <p>
          Use the results to see which option may be more cost-effective in your market,
          and to discuss trade-offs like equity build-up, maintenance responsibilities,
          and flexibility. Investors and first-time buyers can quickly test scenarios for
          different neighborhoods or price points.
        </p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">
          People also ask about renting vs buying
        </h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How does a rent vs buy calculator help me decide?
          </h3>
          <p className="text-gray-600">
            A rent vs buy calculator compares the total cost of renting versus owning a home over a
            set number of years.
            It adds up rent, mortgage payments, taxes, insurance, and other costs to show which
            option may be cheaper or better for building wealth. You can refine ownership costs
            with our{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">
              Mortgage Calculator
            </Link>{" "}
            and{" "}
            <Link href="/affordability-calculator" className="text-blue-600 underline">
              Affordability Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How long do I need to stay in a home for buying to beat renting?
          </h3>
          <p className="text-gray-600">
            Buying typically becomes more attractive the longer you stay because closing costs and
            upfront expenses are spread over more years while you build equity.
            This calculator lets you change your expected years in the home to see the break-even
            point where owning may outperform renting. You can cross-check payments in our{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">
              Mortgage Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            What costs should I include when comparing rent vs buy?
          </h3>
          <p className="text-gray-600">
            When buying, include mortgage payments, property taxes, homeowners insurance, HOA dues,
            maintenance, and potential repairs.
            For rentals, include rent, renter&apos;s insurance, and any utilities you pay
            separately. For investment properties, you can also analyze cash flow with our{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">
              Cash Flow Calculator
            </Link>{" "}
            and{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">
              Cap Rate Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How does home price appreciation affect renting vs buying?
          </h3>
          <p className="text-gray-600">
            If home prices appreciate over time, buying can build equity and net worth faster than
            renting, where payments never create an asset.
            In flat or declining markets, renting may be safer in the short term. You can adjust
            appreciation assumptions in this tool and compare long-term returns in our{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">
              Investment Analyzer
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            What if I don&apos;t have a large down payment yet?
          </h3>
          <p className="text-gray-600">
            You can still compare renting and buying with lower down payment programs, but you may
            pay mortgage insurance or slightly higher rates.
            Use the{" "}
            <Link href="/down-payment-calculator" className="text-blue-600 underline">
              Down Payment Calculator
            </Link>{" "}
            and{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">
              Mortgage Calculator
            </Link>{" "}
            to see how different down payments change your owning costs before deciding whether to
            keep renting or buy.
          </p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">Related Calculators</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/mortgage-calculator" className="text-blue-600 underline">
              Mortgage Calculator
            </Link>
            <Link href="/affordability-calculator" className="text-blue-600 underline">
              Affordability Calculator
            </Link>
            <Link href="/down-payment-calculator" className="text-blue-600 underline">
              Down Payment Calculator
            </Link>
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">
              Cash Flow Calculator
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
