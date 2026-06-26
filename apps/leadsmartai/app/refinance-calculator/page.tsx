"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";

function pmt(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0 || annualRate <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export default function RefinanceCalculator() {
  const [currentBalance, setCurrentBalance] = useState<number>(250000);
  const [currentRate, setCurrentRate] = useState<number>(6.5);
  const [newRate, setNewRate] = useState<number>(5.25);
  const [remainingTermYears, setRemainingTermYears] = useState<number>(25);
  const [closingCosts, setClosingCosts] = useState<number>(4000);

  const { paymentBefore, paymentAfter, monthlySavings, breakEvenMonths } = useMemo(() => {
    const paymentBefore = pmt(currentBalance, currentRate, remainingTermYears);
    const paymentAfter = pmt(currentBalance, newRate, remainingTermYears);
    const monthlySavings = Math.max(0, paymentBefore - paymentAfter);
    const breakEvenMonths = monthlySavings > 0 ? Math.ceil(closingCosts / monthlySavings) : 0;
    return {
      paymentBefore,
      paymentAfter,
      monthlySavings,
      breakEvenMonths,
    };
  }, [currentBalance, currentRate, newRate, remainingTermYears, closingCosts]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Refinance Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://realtybossai.com/refinance-calculator",
          description:
            "Compare your current mortgage to a new rate and estimate monthly savings and break-even when refinancing.",
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

      <h1 className="text-3xl font-bold text-blue-600 mb-2">Refinance Calculator</h1>
      <p className="text-gray-600 mb-8">
        Compare your current loan to a new rate. See monthly savings and break-even.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Loan details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                label="Current loan balance ($)"
                value={currentBalance}
                onChange={setCurrentBalance}
                min={1000}
              />
              <InputField
                label="Current interest rate (%)"
                value={currentRate}
                onChange={setCurrentRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField
                label="New interest rate (%)"
                value={newRate}
                onChange={setNewRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField
                label="Remaining loan term (years)"
                value={remainingTermYears}
                onChange={setRemainingTermYears}
                min={1}
                max={30}
              />
              <InputField
                label="Closing costs ($)"
                value={closingCosts}
                onChange={setClosingCosts}
                min={0}
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
              title="Refinance results"
              value={`$${paymentAfter.toFixed(2)}`}
              details={`Monthly payment before: $${paymentBefore.toFixed(
                2,
              )}\nMonthly payment after: $${paymentAfter.toFixed(
                2,
              )}\nMonthly savings: $${monthlySavings.toFixed(
                2,
              )}\nBreak-even (months): ${breakEvenMonths}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">
          Understand your refinance savings
        </h2>
        <p>
          This refinance calculator compares your current mortgage payment to a new
          interest rate so you can see potential monthly savings and your break-even
          point. Enter your remaining balance, current rate, new rate, and term to
          estimate whether a refinance makes financial sense for your situation.
        </p>
        <p>
          Lenders, agents, and homeowners can use this tool to model different rate
          scenarios, closing costs, and payoff timelines. It is especially useful when
          deciding between rate-and-term refinances, cash-out options, or staying with
          an existing loan.
        </p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">
          People also ask about refinancing a mortgage
        </h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How can a refinance calculator show if refinancing is worth it?
          </h3>
          <p className="text-gray-600">
            A refinance calculator compares your current mortgage payment to a new loan with
            a different interest rate or term so you can see your monthly savings and total
            interest savings.
            It also helps you estimate how long it will take to recoup your closing costs.
            You can come back to this{" "}
            <Link
              href="/refinance-calculator"
              className="text-blue-600 underline"
            >
              Refinance Calculator
            </Link>{" "}
            anytime to test new scenarios.
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            When does it usually make sense to refinance my mortgage?
          </h3>
          <p className="text-gray-600">
            Refinancing often makes sense when you can meaningfully lower your interest rate,
            shorten your term, or remove mortgage insurance without extending your break-even
            point too far into the future.
            This tool lets you compare your current payment to a new one and see how long it
            takes to break even. You can also estimate new payments with our{" "}
            <Link
              href="/mortgage-calculator"
              className="text-blue-600 underline"
            >
              Mortgage Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How do refinance closing costs affect my savings?
          </h3>
          <p className="text-gray-600">
            Refinance closing costs reduce your net benefit because you pay them upfront or
            roll them into the new loan balance.
            If your monthly savings are small or you plan to move soon, you may not recover
            those costs. You can estimate fees in more detail with a{" "}
            <Link
              href="/closing-cost-estimator"
              className="text-blue-600 underline"
            >
              Closing Cost Estimator
            </Link>{" "}
            and then plug them back into this refinance calculator.
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            Should I refinance to a shorter loan term or just lower my payment?
          </h3>
          <p className="text-gray-600">
            Refinancing into a shorter term, like 15 years, usually raises your payment but
            dramatically lowers your total interest, while refinancing to a similar or longer
            term focuses on lowering your monthly payment and improving cash flow.
            You can model both options with the{" "}
            <Link
              href="/refinance-calculator"
              className="text-blue-600 underline"
            >
              Refinance Calculator
            </Link>{" "}
            and compare them with new-purchase scenarios in the{" "}
            <Link
              href="/mortgage-calculator"
              className="text-blue-600 underline"
            >
              Mortgage Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How does my credit score impact refinance rates and savings?
          </h3>
          <p className="text-gray-600">
            Your credit score helps lenders decide what refinance interest rate and terms
            to offer you, which directly affects your monthly payment and potential savings.
            Higher scores usually unlock lower rates and better break-even periods. You can
            use this{" "}
            <Link
              href="/refinance-calculator"
              className="text-blue-600 underline"
            >
              Refinance Calculator
            </Link>{" "}
            to test how different rates would change your payment and total interest.
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            Is it better to refinance or just pay extra toward my current mortgage?
          </h3>
          <p className="text-gray-600">
            Paying extra principal each month can shorten your payoff schedule and reduce
            interest without any closing costs, while refinancing can lower your rate or
            payment but adds fees.
            The best choice depends on your goals, timeline, and available cash. You can
            review extra payment impact with a{" "}
            <Link
              href="/mortgage-calculator"
              className="text-blue-600 underline"
            >
              Loan Amortization Calculator
            </Link>{" "}
            and compare that to potential savings here in the{" "}
            <Link
              href="/refinance-calculator"
              className="text-blue-600 underline"
            >
              Refinance Calculator
            </Link>
            .
          </p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">Related Calculators</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href="/mortgage-calculator"
              className="text-blue-600 underline"
            >
              Mortgage Calculator
            </Link>
            <Link
              href="/mortgage-calculator"
              className="text-blue-600 underline"
            >
              Loan Amortization Calculator
            </Link>
            <Link
              href="/affordability-calculator"
              className="text-blue-600 underline"
            >
              Affordability Calculator
            </Link>
            <Link
              href="/cash-flow-calculator"
              className="text-blue-600 underline"
            >
              Cash Flow Calculator
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
