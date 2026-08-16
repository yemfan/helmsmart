"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import RequireAuthGate from "../../components/RequireAuthGate";

type Inputs = {
  address: string;
  purchasePrice: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  yearBuilt: number | undefined;

  downPaymentPercent: number;
  interestRate: number;
  loanTermYears: number;

  monthlyRent: number;
  otherIncome: number;

  propertyTaxPercent: number;
  insuranceMonthly: number;
  maintenancePercent: number;
  managementPercent: number;
  vacancyPercent: number;
};

type CalculatedResults = {
  loanAmount: number;
  monthlyMortgage: number;
  grossMonthlyIncome: number;
  effectiveMonthlyIncome: number;
  operatingExpensesMonthly: number;
  totalMonthlyExpenses: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  annualNOI: number;
  capRate: number;
  cashOnCashReturn: number;
  cashInvested: number;
  priceToRentRatio: number;
};

function AiRealEstateDealAnalyzerPageInner() {
  const { t } = useTranslation("dashboard");
  const [inputs, setInputs] = useState<Inputs>({
    address: "",
    purchasePrice: 350_000,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1_500,
    yearBuilt: 1995,

    downPaymentPercent: 20,
    interestRate: 6.5,
    loanTermYears: 30,

    monthlyRent: 2_500,
    otherIncome: 0,

    propertyTaxPercent: 1.2,
    insuranceMonthly: 150,
    maintenancePercent: 8,
    managementPercent: 8,
    vacancyPercent: 5,
  });

  const handleChange =
    <K extends keyof Inputs>(key: K) =>
    (value: number | string) => {
      setInputs((prev) => ({
        ...prev,
        [key]:
          typeof prev[key] === "number"
            ? Number(value) || 0
            : (value as string),
      }));
    };

  const handleReset = () => {
    setInputs({
      address: "",
      purchasePrice: 350_000,
      bedrooms: 3,
      bathrooms: 2,
      squareFeet: 1_500,
      yearBuilt: 1995,

      downPaymentPercent: 20,
      interestRate: 6.5,
      loanTermYears: 30,

      monthlyRent: 2_500,
      otherIncome: 0,

      propertyTaxPercent: 1.2,
      insuranceMonthly: 150,
      maintenancePercent: 8,
      managementPercent: 8,
      vacancyPercent: 5,
    });
  };

  const results: CalculatedResults = useMemo(() => {
    const {
      purchasePrice,
      downPaymentPercent,
      interestRate,
      loanTermYears,
      monthlyRent,
      otherIncome,
      propertyTaxPercent,
      insuranceMonthly,
      maintenancePercent,
      managementPercent,
      vacancyPercent,
    } = inputs;

    const downPayment = (purchasePrice * downPaymentPercent) / 100;
    const loanAmount = Math.max(purchasePrice - downPayment, 0);

    const monthlyInterestRate =
      interestRate > 0 ? interestRate / 100 / 12 : 0;
    const numberOfPayments = loanTermYears * 12;

    const monthlyMortgage =
      loanAmount > 0 && monthlyInterestRate > 0
        ? (loanAmount *
            monthlyInterestRate *
            Math.pow(1 + monthlyInterestRate, numberOfPayments)) /
          (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1)
        : loanAmount > 0 && numberOfPayments > 0
        ? loanAmount / numberOfPayments
        : 0;

    const grossMonthlyIncome = monthlyRent + otherIncome;
    const monthlyVacancyLoss =
      (grossMonthlyIncome * vacancyPercent) / 100;
    const effectiveMonthlyIncome =
      grossMonthlyIncome - monthlyVacancyLoss;

    const propertyTaxMonthly =
      (purchasePrice * propertyTaxPercent) / 100 / 12;
    const maintenanceMonthly =
      grossMonthlyIncome * (maintenancePercent / 100);
    const managementMonthly =
      grossMonthlyIncome * (managementPercent / 100);

    const operatingExpensesMonthly =
      propertyTaxMonthly +
      insuranceMonthly +
      maintenanceMonthly +
      managementMonthly;

    const monthlyNOI = effectiveMonthlyIncome - operatingExpensesMonthly;
    const annualNOI = monthlyNOI * 12;

    const monthlyCashFlow =
      effectiveMonthlyIncome -
      operatingExpensesMonthly -
      monthlyMortgage;
    const annualCashFlow = monthlyCashFlow * 12;

    const cashInvested = downPayment;
    const cashOnCashReturn =
      cashInvested > 0 ? (annualCashFlow / cashInvested) * 100 : 0;

    const capRate =
      purchasePrice > 0 ? (annualNOI / purchasePrice) * 100 : 0;

    const priceToRentRatio =
      monthlyRent > 0
        ? purchasePrice / (monthlyRent * 12)
        : 0;

    return {
      loanAmount,
      monthlyMortgage,
      grossMonthlyIncome,
      effectiveMonthlyIncome,
      operatingExpensesMonthly,
      totalMonthlyExpenses: operatingExpensesMonthly + monthlyMortgage,
      monthlyCashFlow,
      annualCashFlow,
      annualNOI,
      capRate,
      cashOnCashReturn,
      cashInvested,
      priceToRentRatio,
    };
  }, [inputs]);

  return (
    <div className="container mx-auto px-4 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">
        AI Real Estate Deal Analyzer
      </h1>
      <p className="text-gray-600 mb-8 max-w-3xl">
        Analyze rental property investments instantly. Estimate cash flow,
        cap rate, and ROI based on your assumptions.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <InputForm
          inputs={inputs}
          onChange={handleChange}
          onAnalyze={() => {
            /* results already track `inputs`; button is UX-only */
          }}
          onReset={handleReset}
        />

        <div className="space-y-6">
          <ResultsPanel
            inputs={inputs}
            results={results}
          />
          <InvestmentSummary
            results={results}
          />
        </div>
      </div>
    </div>
  );
}

type InputFormProps = {
  inputs: Inputs;
  onChange: <K extends keyof Inputs>(
    key: K
  ) => (value: string | number) => void;
  onAnalyze: () => void;
  onReset: () => void;
};

function InputForm({
  inputs,
  onChange,
  onAnalyze,
  onReset,
}: InputFormProps) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="space-y-6">
      {/* Property Address */}
      <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Property Address
        </h2>
        <div className="space-y-3">
          <input
            type="text"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="123 Main St Los Angeles CA"
            value={inputs.address}
            onChange={(e) => onChange("address")(e.target.value)}
          />
          <button
            type="button"
            onClick={onAnalyze}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          >
            Analyze Property
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Address lookup will be enabled in a future update. For now, this
          field is stored in your analysis only.
        </p>
      </div>

      {/* Property Details */}
      <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Property Details
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabeledNumberInput
            label="Purchase Price ($)"
            value={inputs.purchasePrice}
            onChange={onChange("purchasePrice")}
            min={0}
          />
          <LabeledNumberInput
            label="Bedrooms"
            value={inputs.bedrooms}
            onChange={onChange("bedrooms")}
            min={0}
          />
          <LabeledNumberInput
            label="Bathrooms"
            value={inputs.bathrooms}
            onChange={onChange("bathrooms")}
            min={0}
            step={0.5}
          />
          <LabeledNumberInput
            label="Square Feet"
            value={inputs.squareFeet}
            onChange={onChange("squareFeet")}
            min={0}
          />
          <LabeledNumberInput
            label={t("pages.articleChrome.yearBuilt")}
            value={inputs.yearBuilt ?? ""}
            onChange={onChange("yearBuilt")}
            min={1800}
          />
        </div>
      </div>

      {/* Financing */}
      <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Financing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <LabeledNumberInput
            label="Down Payment (%)"
            value={inputs.downPaymentPercent}
            onChange={onChange("downPaymentPercent")}
            min={0}
            max={100}
          />
          <LabeledNumberInput
            label="Interest Rate (%)"
            value={inputs.interestRate}
            onChange={onChange("interestRate")}
            min={0}
            max={20}
            step={0.1}
          />
          <LabeledNumberInput
            label="Loan Term (years)"
            value={inputs.loanTermYears}
            onChange={onChange("loanTermYears")}
            min={5}
            max={40}
          />
        </div>
      </div>

      {/* Rental Income */}
      <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Rental Income
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabeledNumberInput
            label="Monthly Rent ($)"
            value={inputs.monthlyRent}
            onChange={onChange("monthlyRent")}
            min={0}
          />
          <LabeledNumberInput
            label="Other Monthly Income ($)"
            value={inputs.otherIncome}
            onChange={onChange("otherIncome")}
            min={0}
          />
        </div>
      </div>

      {/* Operating Expenses */}
      <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Operating Expenses
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabeledNumberInput
            label="Property Tax (%)"
            value={inputs.propertyTaxPercent}
            onChange={onChange("propertyTaxPercent")}
            min={0}
            step={0.1}
          />
          <LabeledNumberInput
            label="Insurance (monthly $)"
            value={inputs.insuranceMonthly}
            onChange={onChange("insuranceMonthly")}
            min={0}
          />
          <LabeledNumberInput
            label="Maintenance (%)"
            value={inputs.maintenancePercent}
            onChange={onChange("maintenancePercent")}
            min={0}
            max={30}
          />
          <LabeledNumberInput
            label="Property Management (%)"
            value={inputs.managementPercent}
            onChange={onChange("managementPercent")}
            min={0}
            max={30}
          />
          <LabeledNumberInput
            label="Vacancy (%)"
            value={inputs.vacancyPercent}
            onChange={onChange("vacancyPercent")}
            min={0}
            max={30}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAnalyze}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        >
          Analyze Deal
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Reset Inputs
        </button>
        <button
          type="button"
          onClick={() => {
            alert(
              "Share functionality coming soon. For now, copy the URL or screenshot this analysis."
            );
          }}
          className="inline-flex items-center justify-center rounded-md border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          Share This Analysis
        </button>
      </div>
    </div>
  );
}

type ResultsPanelProps = {
  inputs: Inputs;
  results: CalculatedResults;
};

function ResultsPanel({ inputs, results }: ResultsPanelProps) {
  const { t } = useTranslation("dashboard");
  const {
    monthlyMortgage,
    totalMonthlyExpenses,
    monthlyCashFlow,
    capRate,
    cashOnCashReturn,
    priceToRentRatio,
  } = results;

  return (
    <div className="bg-white shadow-md rounded-lg p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Deal Results
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MetricCard
          label="Monthly Mortgage Payment"
          value={
            isFinite(monthlyMortgage)
              ? `$${monthlyMortgage.toFixed(0)}`
              : "$0"
          }
        />
        <MetricCard
          label="Total Monthly Expenses"
          value={`$${totalMonthlyExpenses.toFixed(0)}`}
          hint="Includes operating expenses and mortgage."
        />
        <MetricCard
          label={t("pages.articleChrome.monthlyCashFlow")}
          value={`$${monthlyCashFlow.toFixed(0)}`}
          highlight={
            monthlyCashFlow > 0
              ? "positive"
              : monthlyCashFlow < 0
              ? "negative"
              : "neutral"
          }
        />
        <MetricCard
          label={t("pages.articleChrome.capRate")}
          value={`${capRate.toFixed(2)}%`}
        />
        <MetricCard
          label="Cash on Cash Return"
          value={
            isFinite(cashOnCashReturn)
              ? `${cashOnCashReturn.toFixed(2)}%`
              : "N/A"
          }
        />
        <MetricCard
          label="Price to Rent Ratio"
          value={
            isFinite(priceToRentRatio)
              ? priceToRentRatio.toFixed(1)
              : "N/A"
          }
          hint="Purchase price ÷ annual rent."
        />
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Calculations are based on your current assumptions for{" "}
        <span className="font-semibold">
          {inputs.address || "this property"}
        </span>
        . Adjust values on the left to see how the deal changes.
      </p>
    </div>
  );
}

type InvestmentSummaryProps = {
  results: CalculatedResults;
};

function InvestmentSummary({ results }: InvestmentSummaryProps) {
  const { monthlyCashFlow, capRate, cashOnCashReturn } = results;

  let summary = "";
  const bullets: string[] = [];

  if (monthlyCashFlow > 0) {
    summary =
      "This property appears to generate positive cash flow based on the assumptions provided.";
  } else if (monthlyCashFlow < 0) {
    summary =
      "This property appears to generate negative cash flow under the current assumptions.";
  } else {
    summary =
      "This property appears to break even on cash flow with the current assumptions.";
  }

  if (capRate >= 7) {
    bullets.push(
      "The cap rate is above average for many rental markets, suggesting a potentially strong income-producing asset."
    );
  } else if (capRate <= 4 && capRate > 0) {
    bullets.push(
      "The cap rate is relatively low, which may indicate a premium price, lower income, or a market focused more on appreciation than cash flow."
    );
  } else if (capRate === 0) {
    bullets.push(
      "Cap rate could not be calculated. Check your purchase price and NOI assumptions."
    );
  } else {
    bullets.push(
      "The cap rate is in a moderate range; compare it to similar properties in the same area for better context."
    );
  }

  if (cashOnCashReturn > 10) {
    bullets.push(
      "Cash-on-cash return looks strong relative to the amount of cash invested, given your current down payment assumptions."
    );
  } else if (cashOnCashReturn > 0 && cashOnCashReturn <= 5) {
    bullets.push(
      "Cash-on-cash return is modest. Consider whether appreciation or value-add improvements could justify the investment."
    );
  }

  bullets.push(
    "Investors should verify local rental demand, property condition, and market trends before making any final decision."
  );

  return (
    <div className="bg-white shadow-md rounded-lg p-6 space-y-3 text-sm text-gray-700">
      <h2 className="text-lg font-semibold text-gray-900">
        AI Investment Summary
      </h2>
      <p>{summary}</p>
      <ul className="list-disc list-inside space-y-1">
        {bullets.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-gray-500">
        This summary is generated from simple rules based on cash flow and
        returns. It is not financial advice. Always perform full due
        diligence or consult a professional advisor.
      </p>
    </div>
  );
}

type LabeledNumberInputProps = {
  label: string;
  value: number | string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

function LabeledNumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: LabeledNumberInputProps) {
  return (
    <label className="block text-sm">
      <span className="text-gray-700">{label}</span>
      <input
        type="number"
        className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  highlight?: "positive" | "negative" | "neutral";
};

function MetricCard({
  label,
  value,
  hint,
  highlight,
}: MetricCardProps) {
  const highlightClasses =
    highlight === "positive"
      ? "text-emerald-700"
      : highlight === "negative"
      ? "text-rose-700"
      : "text-gray-900";

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${highlightClasses}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-gray-500">
          {hint}
        </div>
      )}
    </div>
  );
}

export default function AiRealEstateDealAnalyzerPage() {
  return (
    <RequireAuthGate>
      <AiRealEstateDealAnalyzerPageInner />
    </RequireAuthGate>
  );
}
