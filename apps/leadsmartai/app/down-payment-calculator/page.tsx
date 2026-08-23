"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";
import CalculateButton from "@/components/CalculateButton";

function pmt(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export default function DownPaymentCalculator() {
  const { t } = useTranslation("dashboard");
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
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.articleChrome.downPaymentCalculator")}</h1>
      <p className="text-gray-600 mb-8">{t("pages.downPaymentCalculator.sub")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("pages.articleChrome.loanDetails")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label={t("pages.calculatorFields.homePrice")} value={homePrice} onChange={setHomePrice} min={1000} />
              <InputField
                label={t("pages.downPaymentCalculator.downPaymentPct")}
                value={downPaymentPercent}
                onChange={setDownPaymentPercent}
                min={0}
                max={100}
                step={0.5}
              />
              <InputField
                label={t("pages.calculatorFields.savingsAvailable")}
                value={savingsAvailable}
                onChange={setSavingsAvailable}
                min={0}
              />
              <InputField label={t("pages.articleChrome.loanTermYears")} value={loanTerm} onChange={setLoanTerm} min={1} max={30} />
              <InputField
                label={t("pages.articleChrome.interestRate")}
                value={interestRate}
                onChange={setInterestRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField label={t("pages.calculatorFields.propertyTaxYearly")} value={propertyTax} onChange={setPropertyTax} min={0} />
              <InputField label={t("pages.calculatorFields.homeInsuranceYearly")} value={homeInsurance} onChange={setHomeInsurance} min={0} />
              <InputField label={t("pages.calculatorFields.hoaFeesMonthly")} value={hoaFees} onChange={setHoaFees} min={0} />
            </div>
            <div className="pt-2">
              <CalculateButton />
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <ResultCard
              title={t("pages.downPaymentCalculator.resultsAria")}
              value={`$${downPaymentAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              details={`${t("pages.calculatorResults.downPaymentAmount")}: $${downPaymentAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n${t("pages.calculatorResults.remainingLoanAmount")}: $${remainingLoanAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nMonthly payment (incl. tax, insurance, HOA): $${monthlyPayment.toFixed(2)}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.downPaymentCalculator.explainTitle")}</h2>
        <p>{t("pages.downPaymentCalculator.explainA")}</p>
        <p>{t("pages.downPaymentCalculator.explainB")}</p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">{t("pages.downPaymentCalculator.peopleAsk")}</h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.downPaymentCalculator.q1")}</h3>
          <p className="text-gray-600">{t("pages.downPaymentCalculator.a1")}{" "}
            <Link href="/affordability-calculator" className="text-blue-600 underline">{t("pages.articleChrome.affordabilityCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.downPaymentCalculator.q2")}</h3>
          <p className="text-gray-600">{t("pages.downPaymentCalculator.a2")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.downPaymentCalculator.q3")}</h3>
          <p className="text-gray-600">{t("pages.downPaymentCalculator.a3")}{" "}
            <Link href="/rent-vs-buy-calculator" className="text-blue-600 underline">{t("pages.articleChrome.rentVsBuyCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.downPaymentCalculator.q4")}</h3>
          <p className="text-gray-600">{t("pages.downPaymentCalculator.a4")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}{t("pages.downPaymentCalculator.a4Tail")}</p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.downPaymentCalculator.q5")}</h3>
          <p className="text-gray-600">{t("pages.downPaymentCalculator.a5")}{" "}
            <Link href="/affordability-calculator" className="text-blue-600 underline">{t("pages.articleChrome.affordabilityCalculator")}</Link>
            .
          </p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">{t("pages.articleChrome.relatedCalculators")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            <Link href="/affordability-calculator" className="text-blue-600 underline">{t("pages.articleChrome.affordabilityCalculator")}</Link>
            <Link href="/closing-cost-estimator" className="text-blue-600 underline">{t("pages.downPaymentCalculator.closingCostEstimator")}</Link>
            <Link href="/rent-vs-buy-calculator" className="text-blue-600 underline">{t("pages.articleChrome.rentVsBuyCalculator")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
