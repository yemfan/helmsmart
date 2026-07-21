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

export default function DownPaymentCalculator() {
  const [homePrice, setHomePrice] = useState<number>(400000);
  const [downPaymentPercent, setDownPaymentPercent] = useState<number>(20);
  const [savingsAvailable, setSavingsAvailable] = useState<number>(90000);
  const [loanTerm, setLoanTerm] = useState<number>(30);
  const [interestRate, setInterestRate] = useState<number>(6.5);
  const [propertyTax, setPropertyTax] = useState<number>(4000);
  const [homeInsurance, setHomeInsurance] = useState<number>(1200);
  const [hoaFees, setHoaFees] = useState<number>(0);

  const { downPaymentAmount, remainingLoanAmount, monthlyPayment } = useMemo(() => {
    const desiredDown = (homePrice * downPaymentPercent) / 100;
    const downPaymentAmount = Math.min(desiredDown, Math.max(0, savingsAvailable));
    const remainingLoanAmount = Math.max(0, homePrice - downPaymentAmount);
    const taxInsHoa = propertyTax / 12 + homeInsurance / 12 + hoaFees;
    const pi = pmt(remainingLoanAmount, interestRate, loanTerm);
    const monthlyPayment = pi + taxInsHoa;

    return {
      downPaymentAmount,
      remainingLoanAmount,
      monthlyPayment,
    };
  }, [
    homePrice,
    downPaymentPercent,
    savingsAvailable,
    loanTerm,
    interestRate,
    propertyTax,
    homeInsurance,
    hoaFees,
  ]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Down Payment Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/down-payment-calculator",
          description:
            "Calculate required down payment, resulting loan amount, and estimated monthly payment for a home purchase.",
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

      <h1 className="text-3xl font-bold text-blue-600 mb-2">Down Payment Calculator</h1>
      <p className="text-gray-600 mb-8">
        See your down payment, loan amount, and monthly payment. Down payment is capped by savings.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Loan details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Home price ($)" value={homePrice} onChange={setHomePrice} min={1000} />
              <InputField
                label="Down payment (%)"
                value={downPaymentPercent}
                onChange={setDownPaymentPercent}
                min={0}
                max={100}
                step={0.5}
              />
              <InputField
                label="Savings available ($)"
                value={savingsAvailable}
                onChange={setSavingsAvailable}
                min={0}
              />
              <InputField label="Loan term (years)" value={loanTerm} onChange={setLoanTerm} min={1} max={30} />
              <InputField
                label="Interest rate (%)"
                value={interestRate}
                onChange={setInterestRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField label="Property tax (yearly $)" value={propertyTax} onChange={setPropertyTax} min={0} />
              <InputField label="Home insurance (yearly $)" value={homeInsurance} onChange={setHomeInsurance} min={0} />
              <InputField label="HOA fees (monthly $)" value={hoaFees} onChange={setHoaFees} min={0} />
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
              title="Down payment results"
              value={`$${downPaymentAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              details={`Down payment amount: $${downPaymentAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nRemaining loan amount: $${remainingLoanAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nMonthly payment (incl. tax, insurance, HOA): $${monthlyPayment.toFixed(2)}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">
          Plan your down payment strategy
        </h2>
        <p>
          This down payment calculator shows how much cash you will need upfront based on
          the home price and target percentage. It also estimates the resulting loan
          amount and approximate monthly payment, including taxes, insurance, and HOA
          fees when provided.
        </p>
        <p>
          Buyers can use this tool to compare conventional, FHA, and low-down-payment
          options, or to set savings goals before entering the market. Agents can embed
          the calculator in buyer guides to help clients understand how down payment size
          impacts loan terms and affordability.
        </p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">
          People also ask about down payments
        </h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How much should I put down on a house?
          </h3>
          <p className="text-gray-600">
            How much you should put down depends on your budget, loan options, and goals, but many
            buyers aim for 20% to avoid mortgage insurance while others use lower down payments to
            get into a home sooner.
            This calculator shows how different down payment percentages change your loan amount
            and monthly payment so you can choose a strategy that fits your finances. You can also
            check total affordability with our{" "}
            <Link href="/affordability-calculator" className="text-blue-600 underline">
              Affordability Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How does my down payment affect my monthly mortgage payment?
          </h3>
          <p className="text-gray-600">
            A larger down payment reduces your loan amount, which usually lowers your principal and
            interest payment and may remove mortgage insurance.
            A smaller down payment keeps more cash in your pocket but can increase your monthly
            costs. You can see this trade-off by adjusting the percentage here and then reviewing
            the payment breakdown in our{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">
              Mortgage Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            Can I buy a home with less than 20% down?
          </h3>
          <p className="text-gray-600">
            Yes, many loan programs allow down payments as low as 3–5% for qualified buyers, and
            some government-backed loans require even less.
            These programs may involve mortgage insurance or slightly higher rates, which this
            calculator helps you factor into your monthly payment. You can compare those payments
            against renting using our{" "}
            <Link href="/rent-vs-buy-calculator" className="text-blue-600 underline">
              Rent vs Buy Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How long will it take me to save for my target down payment?
          </h3>
          <p className="text-gray-600">
            The time it takes to save depends on your target amount and how much you can set aside
            monthly; this calculator helps you see how different targets change your loan and
            payment.
            Once you pick a realistic down payment goal here, you can plug the resulting loan into
            the{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">
              Mortgage Calculator
            </Link>{" "}
            to confirm that the payment still fits your budget.
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            Should I use my savings for a bigger down payment or keep more cash on hand?
          </h3>
          <p className="text-gray-600">
            Putting more savings into your down payment lowers your monthly housing cost but leaves
            you with less cash for emergencies, repairs, or other investments.
            The right balance depends on your risk tolerance and financial goals. You can test
            different down payment and payment combinations here, then see how they affect overall
            affordability with our{" "}
            <Link href="/affordability-calculator" className="text-blue-600 underline">
              Affordability Calculator
            </Link>
            .
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
            <Link href="/closing-cost-estimator" className="text-blue-600 underline">
              Closing Cost Estimator
            </Link>
            <Link href="/rent-vs-buy-calculator" className="text-blue-600 underline">
              Rent vs Buy Calculator
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
