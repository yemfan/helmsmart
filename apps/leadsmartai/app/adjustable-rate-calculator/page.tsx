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

function balanceAfterPayments(
  principal: number,
  annualRate: number,
  monthlyPmt: number,
  numPayments: number
): number {
  if (principal <= 0 || numPayments <= 0) return principal;
  const r = annualRate / 100 / 12;
  return (
    principal * Math.pow(1 + r, numPayments) -
    monthlyPmt * ((Math.pow(1 + r, numPayments) - 1) / r)
  );
}

export default function AdjustableRateCalculator() {
  const [homePrice, setHomePrice] = useState<number>(400000);
  const [downPayment, setDownPayment] = useState<number>(80000);
  const [loanTerm, setLoanTerm] = useState<number>(30);
  const [initialRate, setInitialRate] = useState<number>(5.5);
  const [adjustmentInterval, setAdjustmentInterval] = useState<number>(5);
  const [maxRate, setMaxRate] = useState<number>(8.5);
  const [propertyTax, setPropertyTax] = useState<number>(4000);
  const [homeInsurance, setHomeInsurance] = useState<number>(1200);
  const [hoaFees, setHoaFees] = useState<number>(0);

  const { initialMonthlyPayment, adjustedMonthlyPayment, totalInterest } = useMemo(() => {
    const principal = Math.max(0, homePrice - downPayment);
    const intervalYears = Math.min(adjustmentInterval, loanTerm);
    const remainingYears = Math.max(0, loanTerm - intervalYears);
    const nInitial = intervalYears * 12;
    const nRemaining = remainingYears * 12;

    const initialPmt = pmt(principal, initialRate, loanTerm);
    const balanceAtAdjustment = balanceAfterPayments(
      principal,
      initialRate,
      initialPmt,
      nInitial
    );
    const adjustedPmt =
      nRemaining > 0 && balanceAtAdjustment > 0
        ? pmt(Math.max(0, balanceAtAdjustment), maxRate, remainingYears)
        : 0;

    const totalPaid = initialPmt * nInitial + adjustedPmt * nRemaining;
    const totalInt = Math.max(0, totalPaid - principal);

    const taxInsHoa = propertyTax / 12 + homeInsurance / 12 + hoaFees;
    return {
      initialMonthlyPayment: initialPmt + taxInsHoa,
      adjustedMonthlyPayment: adjustedPmt + taxInsHoa,
      totalInterest: totalInt,
    };
  }, [
    homePrice,
    downPayment,
    loanTerm,
    initialRate,
    adjustmentInterval,
    maxRate,
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
          name: "Adjustable Rate Mortgage Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://realtybossai.com/adjustable-rate-calculator",
          description:
            "Estimate initial and adjusted monthly payments for adjustable rate mortgages based on rate caps and adjustment schedule.",
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

      <h1 className="text-3xl font-bold text-blue-600 mb-2">
        Adjustable Rate Mortgage (ARM) Calculator
      </h1>
      <p className="text-gray-600 mb-8">
        Estimate initial and adjusted payments when your rate changes.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Loan details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Home price ($)" value={homePrice} onChange={setHomePrice} min={1000} />
              <InputField label="Down payment ($)" value={downPayment} onChange={setDownPayment} min={0} />
              <InputField label="Loan term (years)" value={loanTerm} onChange={setLoanTerm} min={1} max={30} />
              <InputField
                label="Initial interest rate (%)"
                value={initialRate}
                onChange={setInitialRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField
                label="Adjustment interval (years)"
                value={adjustmentInterval}
                onChange={setAdjustmentInterval}
                min={1}
                max={30}
              />
              <InputField
                label="Maximum rate (%)"
                value={maxRate}
                onChange={setMaxRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField label="Property tax (yearly $)" value={propertyTax} onChange={setPropertyTax} min={0} />
              <InputField label="Home insurance (yearly $)" value={homeInsurance} onChange={setHomeInsurance} min={0} />
              <InputField label="HOA fees (monthly $)" value={hoaFees} onChange={setHoaFees} min={0} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <ResultCard
              title="ARM results"
              value={`$${initialMonthlyPayment.toFixed(2)}`}
              details={`Initial monthly payment: $${initialMonthlyPayment.toFixed(2)}\nAdjusted monthly payment (after rate change): $${adjustedMonthlyPayment.toFixed(2)}\nTotal interest over loan term: $${totalInterest.toFixed(2)}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
