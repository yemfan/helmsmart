"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";
import CalculateButton from "@/components/CalculateButton";

export default function CapRateCalculator() {
  const { t } = useTranslation("dashboard");
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
    const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : null;
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
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.articleChrome.capRateCalculator")}</h1>
      <p className="text-gray-600 mb-8">{t("pages.capRateCalculator.sub")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("pages.capRateCalculator.propertyIncome")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label={t("pages.calculatorFields.purchasePrice")} value={purchasePrice} onChange={setPurchasePrice} min={1000} />
              <InputField label={t("pages.calculatorFields.annualRent")} value={annualRent} onChange={setAnnualRent} min={0} />
              <InputField label={t("pages.capRateCalculator.vacancyRate")} value={vacancyRate} onChange={setVacancyRate} min={0} max={50} step={1} />
              <InputField label={t("pages.calculatorFields.propertyTaxYr")} value={propertyTax} onChange={setPropertyTax} min={0} />
              <InputField label={t("pages.calculatorFields.insuranceYr")} value={insurance} onChange={setInsurance} min={0} />
              <InputField label={t("pages.calculatorFields.maintenanceYr")} value={maintenance} onChange={setMaintenance} min={0} />
              <InputField label={t("pages.calculatorFields.otherExpensesYr")} value={otherExpenses} onChange={setOtherExpenses} min={0} />
            </div>
            <div className="pt-2">
              <CalculateButton />
            </div>
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <ResultCard
              title={t("pages.capRateCalculator.capRateAria")}
              value={results.capRate == null ? "—" : `${results.capRate.toFixed(2)}%`}
              details={`${t("pages.calculatorResults.noi")}: $${results.noi.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n${t("pages.calculatorResults.effectiveIncome")}: $${results.effectiveIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n${t("pages.calculatorResults.totalExpenses")}: $${results.totalExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n${t("pages.calculatorResults.capRate")}: ${results.capRate == null ? "—" : `${results.capRate.toFixed(2)}%`}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.capRateCalculator.explainTitle")}</h2>
        <p>{t("pages.capRateCalculator.explainA")}</p>
        <p>{t("pages.capRateCalculator.explainB")}</p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">{t("pages.capRateCalculator.peopleAsk")}</h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.capRateCalculator.q1")}</h3>
          <p className="text-gray-600">{t("pages.capRateCalculator.a1")}{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">{t("pages.articleChrome.capRateCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.capRateCalculator.q2")}</h3>
          <p className="text-gray-600">{t("pages.capRateCalculator.a2")}{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.capRateCalculator.q3")}</h3>
          <p className="text-gray-600">{t("pages.capRateCalculator.a3")}{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">{t("pages.articleChrome.propertyAnalyzer")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.capRateCalculator.q4")}</h3>
          <p className="text-gray-600">{t("pages.capRateCalculator.a4")}{" "}
            <Link href="/roi-calculator" className="text-blue-600 underline">{t("pages.articleChrome.roiCalculator")}</Link>{" "}
            {t("common:conjunctions.and")}{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">{t("pages.articleChrome.propertyAnalyzer")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.capRateCalculator.q5")}</h3>
          <p className="text-gray-600">{t("pages.capRateCalculator.a5")}{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>
            .
          </p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">{t("pages.articleChrome.relatedCalculators")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>
            <Link href="/roi-calculator" className="text-blue-600 underline">{t("pages.articleChrome.roiCalculator")}</Link>
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">{t("pages.capRateCalculator.investmentAnalyzer")}</Link>
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
