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

export default function MortgageCalculator() {
  const [homePrice, setHomePrice] = useState<number>(300000);
  const [downPayment, setDownPayment] = useState<number>(60000);
  const [loanTerm, setLoanTerm] = useState<number>(30);
  const [interestRate, setInterestRate] = useState<number>(5);

  const { principal, monthlyPayment, totalInterest, totalPayment } = useMemo(() => {
    const principal = Math.max(0, homePrice - downPayment);
    const monthlyPayment = pmt(principal, interestRate, loanTerm);
    const numberOfPayments = loanTerm * 12;
    const totalPayment = monthlyPayment * numberOfPayments;
    const totalInterest = Math.max(0, totalPayment - principal);

    return {
      principal,
      monthlyPayment,
      totalInterest,
      totalPayment,
    };
  }, [homePrice, downPayment, interestRate, loanTerm]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Mortgage Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/mortgage-calculator",
          description:
            "Calculate monthly mortgage payments including principal, interest, taxes and insurance for real estate purchases.",
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

      <h1 className="text-3xl font-bold text-blue-600 mb-2">Mortgage Calculator</h1>
      <p className="text-gray-600 mb-8">
        Estimate your monthly mortgage payment, total interest, and total cost.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Loan details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Home price ($)" value={homePrice} onChange={setHomePrice} min={1000} />
              <InputField label="Down payment ($)" value={downPayment} onChange={setDownPayment} min={0} />
              <InputField
                label="Loan term (years)"
                value={loanTerm}
                onChange={setLoanTerm}
                min={1}
                max={30}
              />
              <InputField
                label="Interest rate (%)"
                value={interestRate}
                onChange={setInterestRate}
                min={0.1}
                max={30}
                step={0.125}
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
              title="Estimated monthly payment"
              value={`$${monthlyPayment.toFixed(2)}`}
              details={`Loan amount: $${principal.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nTotal interest over ${loanTerm} years: $${totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nTotal payment: $${totalPayment.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">
          How to use this mortgage calculator
        </h2>
        <p>
          This mortgage calculator helps home buyers estimate their monthly principal and
          interest payment based on the purchase price, down payment, interest rate, and
          loan term. Adjust the inputs to compare different scenarios before you talk to
          a lender or make an offer on a property.
        </p>
        <p>
          Use this tool to quickly understand how changes in rate or loan term affect
          affordability, total interest paid, and long-term cost of home ownership. It is
          ideal for first-time buyers, investors, and agents who need clear payment
          estimates during showings or consultations.
        </p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">
          People also ask about mortgage calculators
        </h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              What does a mortgage calculator help me figure out?
            </h3>
            <p className="mt-1">
              A mortgage calculator helps you estimate your monthly home loan payment based on
              the price, down payment, interest rate, and loan term you enter.
              It lets you quickly compare different scenarios before you talk to a lender or make
              an offer. You can experiment with those inputs anytime using our{" "}
              <Link href="/mortgage-calculator" className="text-blue-600 hover:underline">
                Mortgage Calculator
              </Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              How does a mortgage calculator work behind the scenes?
            </h3>
            <p className="mt-1">
              Most mortgage calculators use a standard loan amortization formula that spreads your
              balance, interest rate, and term over fixed monthly payments.
              Each payment includes both principal and interest, with interest paid first and
              principal paid down over time. For a detailed payoff schedule, try our{" "}
              <Link
                href="/mortgage-calculator"
                className="text-blue-600 hover:underline"
              >
                Loan Amortization Calculator
              </Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              What information do I need before using a mortgage calculator?
            </h3>
            <p className="mt-1">
              To get useful results, you should know your target home price, expected down payment,
              approximate interest rate, and preferred loan term in years.
              Many buyers test different down payment amounts to see how the loan size and monthly
              payment change. You can plan those scenarios with our{" "}
              <Link
                href="/down-payment-calculator"
                className="text-blue-600 hover:underline"
              >
                Down Payment Calculator
              </Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Does a mortgage calculator include taxes, insurance, and HOA fees?
            </h3>
            <p className="mt-1">
              Many mortgage calculators show only principal and interest, while some estimate the
              full PITI payment: principal, interest, property taxes, and homeowners insurance.
              Your real monthly housing cost may also include mortgage insurance and HOA dues, so
              be sure to add those amounts when using the{" "}
              <Link href="/mortgage-calculator" className="text-blue-600 hover:underline">
                Mortgage Calculator
              </Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              How accurate is a mortgage calculator compared to a lender quote?
            </h3>
            <p className="mt-1">
              A mortgage calculator provides an estimate based on your inputs and simple
              assumptions about taxes, insurance, and fees.
              Your final payment can differ once a lender reviews your credit, income, and exact
              closing costs. You can also model future refinance scenarios with our{" "}
              <Link
                href="/refinance-calculator"
                className="text-blue-600 hover:underline"
              >
                Refinance Calculator
              </Link>{" "}
              before you apply.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              How much of my income should my mortgage payment be?
            </h3>
            <p className="mt-1">
              Many guidelines suggest keeping your housing payment around 28–30% of your gross
              monthly income and your total debts within 36–43%.
              A dedicated affordability tool can translate your income and debts into a target
              price range. You can run those numbers with our{" "}
              <Link
                href="/affordability-calculator"
                className="text-blue-600 hover:underline"
              >
                Affordability Calculator
              </Link>{" "}
              and then test exact payments in the{" "}
              <Link href="/mortgage-calculator" className="text-blue-600 hover:underline">
                Mortgage Calculator
              </Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Should I compare 15-year vs 30-year mortgages in a calculator?
            </h3>
            <p className="mt-1">
              Yes, comparing 15-year and 30-year terms in a mortgage calculator shows you the
              trade-off between a higher payment and much lower total interest.
              Shorter terms pay off the loan faster, while longer terms keep monthly payments
              lower. You can switch terms in the{" "}
              <Link href="/mortgage-calculator" className="text-blue-600 hover:underline">
                Mortgage Calculator
              </Link>{" "}
              and review the payoff pattern using the{" "}
              <Link
                href="/mortgage-calculator"
                className="text-blue-600 hover:underline"
              >
                Loan Amortization Calculator
              </Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              How does the interest rate change my monthly mortgage payment?
            </h3>
            <p className="mt-1">
              Even a small change in interest rate can significantly raise or lower your monthly
              mortgage payment and total interest over time.
              Higher rates push more of each payment toward interest, while lower rates help you
              build equity faster. You can see the impact instantly by adjusting the rate in our{" "}
              <Link href="/mortgage-calculator" className="text-blue-600 hover:underline">
                Mortgage Calculator
              </Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Can I use a mortgage calculator before I&apos;m pre-approved?
            </h3>
            <p className="mt-1">
              You can and should use a mortgage calculator before getting pre-approved to explore
              price ranges and monthly payments.
              It helps you set realistic expectations and focus on homes that fit your budget. To
              compare owning versus renting, you can also use our{" "}
              <Link
                href="/rent-vs-buy-calculator"
                className="text-blue-600 hover:underline"
              >
                Rent vs Buy Calculator
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="mt-10">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Related Calculators
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href="/affordability-calculator"
              className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50"
            >
              Affordability Calculator
            </Link>
            <Link
              href="/down-payment-calculator"
              className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50"
            >
              Down Payment Calculator
            </Link>
            <Link
              href="/refinance-calculator"
              className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50"
            >
              Refinance Calculator
            </Link>
            <Link
              href="/rent-vs-buy-calculator"
              className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50"
            >
              Rent vs Buy Calculator
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
