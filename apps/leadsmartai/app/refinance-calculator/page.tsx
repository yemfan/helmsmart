"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("dashboard");
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
          url: "https://closebossai.com/refinance-calculator",
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
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.refinanceCalculator.h1")}</h1>
      <p className="text-gray-600 mb-8">{t("pages.refinanceCalculator.sub")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("pages.articleChrome.loanDetails")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                label="Current loan balance ($)"
                value={currentBalance}
                onChange={setCurrentBalance}
                min={1000}
              />
              <InputField
                label={t("pages.refinanceCalculator.currentRate")}
                value={currentRate}
                onChange={setCurrentRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField
                label={t("pages.refinanceCalculator.newRate")}
                value={newRate}
                onChange={setNewRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField
                label={t("pages.refinanceCalculator.remainingTerm")}
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
              >{t("pages.articleChrome.calculate")}</button>
            </div>
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <ResultCard
              title={t("pages.refinanceCalculator.resultsAria")}
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
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.refinanceCalculator.understandTitle")}</h2>
        <p>{t("pages.refinanceCalculator.understandA")}</p>
        <p>{t("pages.refinanceCalculator.understandB")}</p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">{t("pages.refinanceCalculator.peopleAsk")}</h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.refinanceCalculator.q1")}</h3>
          <p className="text-gray-600">{t("pages.refinanceCalculator.a1")}{" "}
            <Link
              href="/refinance-calculator"
              className="text-blue-600 underline"
            >{t("pages.refinanceCalculator.h1")}</Link>{" "}{t("pages.refinanceCalculator.anytime")}</p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.refinanceCalculator.q2")}</h3>
          <p className="text-gray-600">{t("pages.refinanceCalculator.a2")}{" "}
            <Link
              href="/mortgage-calculator"
              className="text-blue-600 underline"
            >{t("pages.articleChrome.mortgageCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.refinanceCalculator.q3")}</h3>
          <p className="text-gray-600">{t("pages.refinanceCalculator.a3")}{" "}
            <Link
              href="/closing-cost-estimator"
              className="text-blue-600 underline"
            >{t("pages.refinanceCalculator.closingEstimator")}</Link>{" "}{t("pages.refinanceCalculator.a3Tail")}</p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.refinanceCalculator.q4")}</h3>
          <p className="text-gray-600">{t("pages.refinanceCalculator.a4")}{" "}
            <Link
              href="/refinance-calculator"
              className="text-blue-600 underline"
            >{t("pages.refinanceCalculator.h1")}</Link>{" "}{t("pages.refinanceCalculator.a4Tail")}{" "}
            <Link
              href="/mortgage-calculator"
              className="text-blue-600 underline"
            >{t("pages.articleChrome.mortgageCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.refinanceCalculator.q5")}</h3>
          <p className="text-gray-600">{t("pages.refinanceCalculator.a5")}{" "}
            <Link
              href="/refinance-calculator"
              className="text-blue-600 underline"
            >{t("pages.refinanceCalculator.h1")}</Link>{" "}{t("pages.refinanceCalculator.a5Tail")}</p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.refinanceCalculator.q6")}</h3>
          <p className="text-gray-600">{t("pages.refinanceCalculator.a6")}{" "}
            <Link
              href="/mortgage-calculator"
              className="text-blue-600 underline"
            >{t("pages.articleChrome.amortizationCalculator")}</Link>{" "}{t("pages.refinanceCalculator.a6Tail")}{" "}
            <Link
              href="/refinance-calculator"
              className="text-blue-600 underline"
            >{t("pages.refinanceCalculator.h1")}</Link>
            .
          </p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">{t("pages.articleChrome.relatedCalculators")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href="/mortgage-calculator"
              className="text-blue-600 underline"
            >{t("pages.articleChrome.mortgageCalculator")}</Link>
            <Link
              href="/mortgage-calculator"
              className="text-blue-600 underline"
            >{t("pages.articleChrome.amortizationCalculator")}</Link>
            <Link
              href="/affordability-calculator"
              className="text-blue-600 underline"
            >{t("pages.articleChrome.affordabilityCalculator")}</Link>
            <Link
              href="/cash-flow-calculator"
              className="text-blue-600 underline"
            >{t("pages.articleChrome.cashFlowCalculator")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
