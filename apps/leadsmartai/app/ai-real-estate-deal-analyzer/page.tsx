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

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.dealAnalyzer.h1")}</h1>
      <p className="text-gray-600 mb-8 max-w-3xl">{t("pages.dealAnalyzer.sub")}</p>

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
        <h2 className="text-lg font-semibold text-gray-900">{t("pages.dealAnalyzer.propertyAddress")}</h2>
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
          >{t("pages.dealAnalyzer.analyzeProperty")}</button>
        </div>
        <p className="text-xs text-gray-500">{t("pages.dealAnalyzer.addressNote")}</p>
      </div>

      {/* Property Details */}
      <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{t("pages.dealAnalyzer.propertyDetails")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabeledNumberInput
            label={t("pages.calculatorFields.purchasePrice")}
            value={inputs.purchasePrice}
            onChange={onChange("purchasePrice")}
            min={0}
          />
          <LabeledNumberInput
            label={t("pages.dealAnalyzer.bedrooms")}
            value={inputs.bedrooms}
            onChange={onChange("bedrooms")}
            min={0}
          />
          <LabeledNumberInput
            label={t("pages.dealAnalyzer.bathrooms")}
            value={inputs.bathrooms}
            onChange={onChange("bathrooms")}
            min={0}
            step={0.5}
          />
          <LabeledNumberInput
            label={t("pages.dealAnalyzer.squareFeet")}
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
        <h2 className="text-lg font-semibold text-gray-900">{t("pages.dealAnalyzer.financing")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <LabeledNumberInput
            label={t("pages.dealAnalyzer.downPayment")}
            value={inputs.downPaymentPercent}
            onChange={onChange("downPaymentPercent")}
            min={0}
            max={100}
          />
          <LabeledNumberInput
            label={t("pages.dealAnalyzer.interestRate")}
            value={inputs.interestRate}
            onChange={onChange("interestRate")}
            min={0}
            max={20}
            step={0.1}
          />
          <LabeledNumberInput
            label={t("pages.dealAnalyzer.loanTerm")}
            value={inputs.loanTermYears}
            onChange={onChange("loanTermYears")}
            min={5}
            max={40}
          />
        </div>
      </div>

      {/* Rental Income */}
      <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{t("pages.dealAnalyzer.rentalIncome")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabeledNumberInput
            label={t("pages.calculatorFields.monthlyRent")}
            value={inputs.monthlyRent}
            onChange={onChange("monthlyRent")}
            min={0}
          />
          <LabeledNumberInput
            label={t("pages.calculatorFields.otherMonthlyIncome")}
            value={inputs.otherIncome}
            onChange={onChange("otherIncome")}
            min={0}
          />
        </div>
      </div>

      {/* Operating Expenses */}
      <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{t("pages.dealAnalyzer.operatingExpenses")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LabeledNumberInput
            label={t("pages.dealAnalyzer.propertyTax")}
            value={inputs.propertyTaxPercent}
            onChange={onChange("propertyTaxPercent")}
            min={0}
            step={0.1}
          />
          <LabeledNumberInput
            label={t("pages.calculatorFields.insuranceMonthly")}
            value={inputs.insuranceMonthly}
            onChange={onChange("insuranceMonthly")}
            min={0}
          />
          <LabeledNumberInput
            label={t("pages.dealAnalyzer.maintenance")}
            value={inputs.maintenancePercent}
            onChange={onChange("maintenancePercent")}
            min={0}
            max={30}
          />
          <LabeledNumberInput
            label={t("pages.dealAnalyzer.management")}
            value={inputs.managementPercent}
            onChange={onChange("managementPercent")}
            min={0}
            max={30}
          />
          <LabeledNumberInput
            label={t("pages.dealAnalyzer.vacancy")}
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
        >{t("pages.dealAnalyzer.analyzeDeal")}</button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >{t("pages.dealAnalyzer.resetInputs")}</button>
        <button
          type="button"
          onClick={() => {
            alert(
              "Share functionality coming soon. For now, copy the URL or screenshot this analysis."
            );
          }}
          className="inline-flex items-center justify-center rounded-md border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >{t("pages.dealAnalyzer.shareAnalysis")}</button>
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
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("pages.dealAnalyzer.dealResults")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MetricCard
          label={t("pages.dealAnalyzer.monthlyMortgage")}
          value={
            isFinite(monthlyMortgage)
              ? `$${monthlyMortgage.toFixed(0)}`
              : "$0"
          }
        />
        <MetricCard
          label={t("pages.dealAnalyzer.totalMonthly")}
          value={`$${totalMonthlyExpenses.toFixed(0)}`}
          hint={t("pages.dealAnalyzer.totalMonthlyHint")}
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
          label={t("pages.dealAnalyzer.cashOnCash")}
          value={
            isFinite(cashOnCashReturn)
              ? `${cashOnCashReturn.toFixed(2)}%`
              : "N/A"
          }
        />
        <MetricCard
          label={t("pages.dealAnalyzer.priceToRent")}
          value={
            isFinite(priceToRentRatio)
              ? priceToRentRatio.toFixed(1)
              : "N/A"
          }
          hint="Purchase price ÷ annual rent."
        />
      </div>
      <p className="mt-2 text-xs text-gray-500">{t("pages.dealAnalyzer.basedOn")}{" "}
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
  const { t } = useTranslation("dashboard");
  const { monthlyCashFlow, capRate, cashOnCashReturn } = results;

  /*
   * Keys, chosen by the same branches. Composing the verdict from literals
   * made it English regardless of the reader's language, and a scan that reads
   * JSX could never have seen it.
   */
  const summaryKey =
    monthlyCashFlow > 0
      ? "cfPositive"
      : monthlyCashFlow < 0
        ? "cfNegative"
        : "cfBreakEven";
  const bulletKeys: string[] = [];

  if (capRate >= 7) bulletKeys.push("capHigh");
  else if (capRate <= 4 && capRate > 0) bulletKeys.push("capLow");
  else if (capRate === 0) bulletKeys.push("capNone");
  else bulletKeys.push("capMid");

  if (cashOnCashReturn > 10) bulletKeys.push("cocStrong");
  else if (cashOnCashReturn > 0 && cashOnCashReturn <= 5) bulletKeys.push("cocModest");

  bulletKeys.push("verifyLocally");

  return (
    <div className="bg-white shadow-md rounded-lg p-6 space-y-3 text-sm text-gray-700">
      <h2 className="text-lg font-semibold text-gray-900">{t("pages.dealAnalyzer.aiSummary")}</h2>
      <p>{t(`pages.dealAnalyzer.${summaryKey}`)}</p>
      <ul className="list-disc list-inside space-y-1">
        {bulletKeys.map((key) => (
          <li key={key}>{t(`pages.dealAnalyzer.${key}`)}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-gray-500">{t("pages.dealAnalyzer.notAdvice")}</p>
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
