"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";

function principalFromPmt(monthlyPmt: number, annualRate: number, years: number): number {
  if (monthlyPmt <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (monthlyPmt * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n));
}

function pmt(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export default function AffordabilityCalculator() {
  const { t } = useTranslation("dashboard");
  const [annualIncome, setAnnualIncome] = useState<number>(120000);
  const [monthlyDebts, setMonthlyDebts] = useState<number>(500);
  const [downPayment, setDownPayment] = useState<number>(60000);
  const [interestRate, setInterestRate] = useState<number>(6.5);
  const [loanTerm, setLoanTerm] = useState<number>(30);

  const { maxHomePrice, estimatedMonthlyPayment } = useMemo(() => {
    const monthlyIncome = annualIncome / 12;
    const maxTotalDebtPayment = 0.36 * monthlyIncome;
    const maxHousingPayment = Math.max(0, maxTotalDebtPayment - monthlyDebts);
    const maxPrincipal = principalFromPmt(maxHousingPayment, interestRate, loanTerm);
    const maxHomePrice = maxPrincipal + downPayment;
    const principal = Math.max(0, maxHomePrice - downPayment);
    const monthlyPmt = pmt(principal, interestRate, loanTerm);
    return {
      maxHomePrice: Math.max(0, maxHomePrice),
      estimatedMonthlyPayment: monthlyPmt,
    };
  }, [annualIncome, monthlyDebts, downPayment, interestRate, loanTerm]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Home Affordability Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/affordability-calculator",
          description:
            "Estimate how much house you can afford based on income, debts, interest rate and loan term using a debt-to-income ratio.",
        }}
      />
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.articleChrome.affordabilityCalculator")}</h1>
      <p className="text-gray-600 mb-8">{t("pages.affordabilityCalculator.sub")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("pages.affordabilityCalculator.yourFinances")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                label="Annual income ($)"
                value={annualIncome}
                onChange={setAnnualIncome}
                min={0}
              />
              <InputField
                label="Monthly debts ($)"
                value={monthlyDebts}
                onChange={setMonthlyDebts}
                min={0}
              />
              <InputField
                label="Down payment ($)"
                value={downPayment}
                onChange={setDownPayment}
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
            {/*
             * `value` already displays the maximum home price as the big
             * headline number. `details` previously duplicated it on a
             * second line ("Maximum home price: $...") — removed the
             * duplication and kept only the monthly payment breakdown.
             */}
            <ResultCard
              title={t("pages.affordabilityCalculator.maxPriceAria")}
              value={`$${Math.round(maxHomePrice).toLocaleString()}`}
              details={`Estimated monthly payment: $${estimatedMonthlyPayment.toFixed(2)}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.affordabilityCalculator.explainTitle")}</h2>
        <p>{t("pages.affordabilityCalculator.explainA")}</p>
        <p>{t("pages.affordabilityCalculator.explainB")}</p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">{t("pages.affordabilityCalculator.peopleAsk")}</h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.affordabilityCalculator.q1")}</h3>
          <p className="text-gray-600">{t("pages.affordabilityCalculator.a1")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.affordabilityCalculator.q2")}</h3>
          <p className="text-gray-600">{t("pages.affordabilityCalculator.a2")}{" "}
            <Link href="/affordability-calculator" className="text-blue-600 underline">{t("pages.articleChrome.affordabilityCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.affordabilityCalculator.q3")}</h3>
          <p className="text-gray-600">{t("pages.affordabilityCalculator.a3")}{" "}
            <Link href="/down-payment-calculator" className="text-blue-600 underline">{t("pages.articleChrome.downPaymentCalculator")}</Link>{" "}{t("pages.affordabilityCalculator.a3Tail")}</p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.affordabilityCalculator.q4")}</h3>
          <p className="text-gray-600">{t("pages.affordabilityCalculator.a4")}{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.affordabilityCalculator.q5")}</h3>
          <p className="text-gray-600">{t("pages.affordabilityCalculator.a5")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.affordabilityCalculator.q6")}</h3>
          <p className="text-gray-600">{t("pages.affordabilityCalculator.a6")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
            or{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.amortizationCalculator")}</Link>
            .
          </p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">{t("pages.articleChrome.relatedCalculators")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            <Link href="/down-payment-calculator" className="text-blue-600 underline">{t("pages.articleChrome.downPaymentCalculator")}</Link>
            <Link href="/rent-vs-buy-calculator" className="text-blue-600 underline">{t("pages.articleChrome.rentVsBuyCalculator")}</Link>
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
