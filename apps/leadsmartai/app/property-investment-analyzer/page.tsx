"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";

export default function PropertyInvestmentAnalyzer() {
  const { t } = useTranslation("dashboard");
  const [purchasePrice, setPurchasePrice] = useState<number>(350000);
  const [monthlyRent, setMonthlyRent] = useState<number>(2600);
  const [monthlyExpenses, setMonthlyExpenses] = useState<number>(600);
  const [monthlyMortgage, setMonthlyMortgage] = useState<number>(1600);

  const results = useMemo(() => {
    const monthlyNOI = monthlyRent - monthlyExpenses;
    const monthlyCashFlow = monthlyNOI - monthlyMortgage;
    const annualCashFlow = monthlyCashFlow * 12;
    const annualNOI = monthlyNOI * 12;
    const cashOnCashROI =
      purchasePrice > 0 ? (annualCashFlow / purchasePrice) * 100 : 0;
    const capRate = purchasePrice > 0 ? (annualNOI / purchasePrice) * 100 : 0;

    return {
      monthlyNOI,
      monthlyCashFlow,
      annualCashFlow,
      annualNOI,
      cashOnCashROI,
      capRate,
    };
  }, [purchasePrice, monthlyRent, monthlyExpenses, monthlyMortgage]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Property Investment Analyzer",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/property-investment-analyzer",
          description:
            "Analyze rental property performance including cash flow, net operating income, cap rate and simple ROI.",
        }}
      />
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.articleChrome.propertyAnalyzer")}</h1>
      <p className="text-gray-600 mb-8">{t("pages.propertyInvestmentAnalyzer.sub")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("pages.propertyInvestmentAnalyzer.inputs")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                label="Purchase price ($)"
                value={purchasePrice}
                onChange={setPurchasePrice}
                min={10000}
              />
              <InputField
                label="Monthly rent ($)"
                value={monthlyRent}
                onChange={setMonthlyRent}
                min={0}
              />
              <InputField
                label="Monthly operating expenses ($)"
                value={monthlyExpenses}
                onChange={setMonthlyExpenses}
                min={0}
              />
              <InputField
                label="Monthly mortgage payment ($)"
                value={monthlyMortgage}
                onChange={setMonthlyMortgage}
                min={0}
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
              title={t("pages.propertyInvestmentAnalyzer.performanceAria")}
              value={`${results.cashOnCashROI.toFixed(2)}% ROI`}
              details={
                `Monthly NOI: $${results.monthlyNOI.toFixed(2)}` +
                `\nMonthly cash flow: $${results.monthlyCashFlow.toFixed(2)}` +
                `\nAnnual cash flow: $${results.annualCashFlow.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}` +
                `\nCap rate: ${results.capRate.toFixed(2)}%`
              }
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.propertyInvestmentAnalyzer.explainTitle")}</h2>
        <p>{t("pages.propertyInvestmentAnalyzer.explainA")}</p>
        <p>{t("pages.propertyInvestmentAnalyzer.explainB")}</p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">{t("pages.propertyInvestmentAnalyzer.peopleAsk")}</h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.propertyInvestmentAnalyzer.q1")}</h3>
          <p className="text-gray-600">{t("pages.propertyInvestmentAnalyzer.a1")}{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}
            and{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">{t("pages.articleChrome.capRateCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.propertyInvestmentAnalyzer.q2")}</h3>
          <p className="text-gray-600">{t("pages.propertyInvestmentAnalyzer.a2")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}{t("pages.propertyInvestmentAnalyzer.a2Tail")}{" "}
            <Link
              href="/property-investment-analyzer"
              className="text-blue-600 underline"
            >{t("pages.articleChrome.propertyAnalyzer")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.propertyInvestmentAnalyzer.q3")}</h3>
          <p className="text-gray-600">{t("pages.propertyInvestmentAnalyzer.a3")}{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">{t("pages.articleChrome.capRateCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.propertyInvestmentAnalyzer.q4")}</h3>
          <p className="text-gray-600">{t("pages.propertyInvestmentAnalyzer.a4")}{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}{t("pages.propertyInvestmentAnalyzer.a4Tail")}</p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.propertyInvestmentAnalyzer.q5")}</h3>
          <p className="text-gray-600">{t("pages.propertyInvestmentAnalyzer.a5")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
            or{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.amortizationCalculator")}</Link>{" "}{t("pages.propertyInvestmentAnalyzer.a5Tail")}</p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.propertyInvestmentAnalyzer.q6")}</h3>
          <p className="text-gray-600">{t("pages.propertyInvestmentAnalyzer.a6")}{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}{t("pages.propertyInvestmentAnalyzer.a6Tail")}{" "}
            <Link href="/roi-calculator" className="text-blue-600 underline">{t("pages.articleChrome.roiCalculator")}</Link>
            .
          </p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">{t("pages.articleChrome.relatedCalculators")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">{t("pages.articleChrome.capRateCalculator")}</Link>
            <Link href="/roi-calculator" className="text-blue-600 underline">{t("pages.articleChrome.roiCalculator")}</Link>
            <Link href="/rent-vs-buy-calculator" className="text-blue-600 underline">{t("pages.articleChrome.rentVsBuyCalculator")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
