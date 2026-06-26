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

export default function ROICalculator() {
  const [purchasePrice, setPurchasePrice] = useState<number>(300000);
  const [downPayment, setDownPayment] = useState<number>(90000);
  const [interestRate, setInterestRate] = useState<number>(6.5);
  const [loanTerm, setLoanTerm] = useState<number>(30);
  const [annualRent, setAnnualRent] = useState<number>(26400);
  const [annualExpenses, setAnnualExpenses] = useState<number>(6000);
  const [appreciationPercent, setAppreciationPercent] = useState<number>(3);
  const [yearsHeld, setYearsHeld] = useState<number>(5);

  const results = useMemo(() => {
    const loanAmount = Math.max(0, purchasePrice - downPayment);
    const monthlyPmt = pmt(loanAmount, interestRate, loanTerm);
    const r = interestRate / 100 / 12;
    const n = 12 * Math.min(yearsHeld, loanTerm);
    const remainingBalance =
      n <= 0 || loanAmount <= 0
        ? 0
        : Math.max(
            0,
            loanAmount * Math.pow(1 + r, n) -
              monthlyPmt * ((Math.pow(1 + r, n) - 1) / r)
          );
    const totalPrincipalPaid = Math.max(0, loanAmount - remainingBalance);
    const totalMortgagePayments = monthlyPmt * n;
    const totalInterestPaid = totalMortgagePayments - totalPrincipalPaid;
    const futureValue = purchasePrice * Math.pow(1 + appreciationPercent / 100, yearsHeld);
    const equity = Math.max(0, futureValue - remainingBalance);
    const totalRentReceived = annualRent * yearsHeld;
    const totalExpensesPaid = annualExpenses * yearsHeld;
    const netProfit =
      totalRentReceived - totalExpensesPaid - totalInterestPaid + (equity - downPayment);
    const roi = downPayment > 0 ? (netProfit / downPayment) * 100 : 0;
    return {
      netProfit,
      roi,
      equity,
      totalRentReceived,
    };
  }, [
    purchasePrice,
    downPayment,
    interestRate,
    loanTerm,
    annualRent,
    annualExpenses,
    appreciationPercent,
    yearsHeld,
  ]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Real Estate ROI Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://realtybossai.com/roi-calculator",
          description:
            "Model long-term real estate return on investment using rent, expenses, financing and property appreciation.",
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

      <h1 className="text-3xl font-bold text-blue-600 mb-2">ROI Calculator</h1>
      <p className="text-gray-600 mb-8">
        Estimate return on investment including rent, expenses, and appreciation.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Investment inputs</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Purchase price ($)" value={purchasePrice} onChange={setPurchasePrice} min={1000} />
              <InputField label="Down payment ($)" value={downPayment} onChange={setDownPayment} min={0} />
              <InputField label="Interest rate (%)" value={interestRate} onChange={setInterestRate} min={0.1} max={30} step={0.125} />
              <InputField label="Loan term (years)" value={loanTerm} onChange={setLoanTerm} min={1} max={30} />
              <InputField label="Annual rent ($)" value={annualRent} onChange={setAnnualRent} min={0} />
              <InputField label="Annual expenses ($)" value={annualExpenses} onChange={setAnnualExpenses} min={0} />
              <InputField label="Appreciation (%/yr)" value={appreciationPercent} onChange={setAppreciationPercent} min={-10} max={20} step={0.5} />
              <InputField label="Years held" value={yearsHeld} onChange={setYearsHeld} min={1} max={30} />
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
              title="ROI results"
              value={`${results.roi.toFixed(2)}%`}
              details={`Net profit: $${results.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nTotal rent received: $${results.totalRentReceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nEquity (est.): $${results.equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nROI: ${results.roi.toFixed(2)}%`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">
          Long-term real estate ROI modeling
        </h2>
        <p>
          The ROI calculator models long-term returns by combining rental income,
          operating expenses, mortgage amortization, and property appreciation. It
          estimates equity growth, total profit, and percentage return based on your
          down payment and holding period.
        </p>
        <p>
          This tool is ideal for buy-and-hold investors who want to see how a property
          might perform over several years. Adjust appreciation, expenses, and financing
          to test different market conditions and exit strategies.
        </p>
      </section>
    </div>
  );
}
