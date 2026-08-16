"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

export default function CapRateRoiCalculator() {
  const { t } = useTranslation("dashboard");
  const [purchasePrice, setPurchasePrice] = useState<number>(400000);
  const [downPayment, setDownPayment] = useState<number>(80000);
  const [annualRent, setAnnualRent] = useState<number>(28800);
  const [vacancyRate, setVacancyRate] = useState<number>(5);
  const [propertyTax, setPropertyTax] = useState<number>(4800);
  const [insurance, setInsurance] = useState<number>(1200);
  const [maintenance, setMaintenance] = useState<number>(2400);
  const [otherExpenses, setOtherExpenses] = useState<number>(1200);
  const [interestRate, setInterestRate] = useState<number>(6.5);
  const [loanTerm, setLoanTerm] = useState<number>(30);

  const results = useMemo(() => {
    const effectiveIncome = annualRent * (1 - vacancyRate / 100);
    const operatingExpenses =
      propertyTax + insurance + maintenance + otherExpenses;
    const noi = effectiveIncome - operatingExpenses;

    const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;

    const loanAmount = Math.max(0, purchasePrice - downPayment);
    const annualDebtService =
      loanAmount > 0 ? pmt(loanAmount, interestRate, loanTerm) * 12 : 0;
    const annualCashFlow = noi - annualDebtService;
    const simpleRoi =
      downPayment > 0 ? (annualCashFlow / downPayment) * 100 : 0;

    return {
      noi,
      capRate,
      annualCashFlow,
      simpleRoi,
      effectiveIncome,
      operatingExpenses,
      annualDebtService,
    };
  }, [
    purchasePrice,
    downPayment,
    annualRent,
    vacancyRate,
    propertyTax,
    insurance,
    maintenance,
    otherExpenses,
    interestRate,
    loanTerm,
  ]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Cap Rate & ROI Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/cap-rate-roi-calculator",
          description:
            "Calculate cap rate and first-year cash-on-cash ROI for leveraged real estate investments.",
        }}
      />
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
        Cap Rate &amp; ROI Calculator
      </h1>
      <p className="text-gray-600 mb-8">
        Calculate capitalization rate and simple cash-on-cash ROI for a rental
        property.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Property &amp; financing
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                label="Purchase price ($)"
                value={purchasePrice}
                onChange={setPurchasePrice}
                min={1000}
              />
              <InputField
                label="Down payment ($)"
                value={downPayment}
                onChange={setDownPayment}
                min={0}
              />
              <InputField
                label="Annual rent ($)"
                value={annualRent}
                onChange={setAnnualRent}
                min={0}
              />
              <InputField
                label="Vacancy rate (%)"
                value={vacancyRate}
                onChange={setVacancyRate}
                min={0}
                max={50}
                step={1}
              />
              <InputField
                label="Property tax ($/yr)"
                value={propertyTax}
                onChange={setPropertyTax}
                min={0}
              />
              <InputField
                label="Insurance ($/yr)"
                value={insurance}
                onChange={setInsurance}
                min={0}
              />
              <InputField
                label="Maintenance ($/yr)"
                value={maintenance}
                onChange={setMaintenance}
                min={0}
              />
              <InputField
                label="Other expenses ($/yr)"
                value={otherExpenses}
                onChange={setOtherExpenses}
                min={0}
              />
              <InputField
                label={t("pages.articleChrome.interestRate")}
                value={interestRate}
                onChange={setInterestRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField
                label={t("pages.articleChrome.loanTermYears")}
                value={loanTerm}
                onChange={setLoanTerm}
                min={1}
                max={30}
              />
            </div>
            <div className="pt-2">
              <button
                type="button"
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >{t("pages.articleChrome.calculate")}</button>
            </div>
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <ResultCard
              title="Cap rate & ROI"
              value={`${results.capRate.toFixed(2)}% cap`}
              details={`NOI: $${results.noi.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}\nEffective income: $${results.effectiveIncome.toLocaleString(
                undefined,
                { maximumFractionDigits: 0 }
              )}\nOperating expenses: $${results.operatingExpenses.toLocaleString(
                undefined,
                { maximumFractionDigits: 0 }
              )}\nAnnual debt service: $${results.annualDebtService.toLocaleString(
                undefined,
                { maximumFractionDigits: 0 }
              )}\nCap rate: ${results.capRate.toFixed(
                2
              )}%\nCash-on-cash ROI (year 1): ${results.simpleRoi.toFixed(2)}%`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">
          Combine cap rate and cash-on-cash ROI
        </h2>
        <p>
          This calculator blends traditional cap rate with first-year cash-on-cash ROI
          by layering financing costs on top of NOI. It shows how leverage, interest
          rates, and down payment size impact actual investor returns compared to the
          unlevered cap rate.
        </p>
        <p>
          Use it when evaluating loan options, comparing all-cash purchases to financed
          deals, or presenting investment opportunities to partners. The tool helps
          clarify how much of the return comes from property performance versus
          financing structure.
        </p>
      </section>
    </div>
  );
}

