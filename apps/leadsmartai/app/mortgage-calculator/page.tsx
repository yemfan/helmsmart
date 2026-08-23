"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";
import CalculateButton from "@/components/CalculateButton";

function pmt(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0 || annualRate <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export default function MortgageCalculator() {
  const { t } = useTranslation("dashboard");
  const [homePrice, setHomePrice] = useState<number>(300000);
  const [downPayment, setDownPayment] = useState<number>(60000);
  const [loanTerm, setLoanTerm] = useState<number>(30);
  const [interestRate, setInterestRate] = useState<number>(5);

  const { principal, monthlyPayment, totalInterest, totalPayment } = useMemo(() => {
    const principal = Math.max(0, homePrice - downPayment);
    const monthlyPayment = pmt(principal, interestRate, loanTerm);
    const numberOfPayments = loanTerm * 12;
    const totalPayment = monthlyPayment * numberOfPayments;
    const totalInterest = Math.max(0, totalPayment - principal);

    return {
      principal,
      monthlyPayment,
      totalInterest,
      totalPayment,
    };
  }, [homePrice, downPayment, interestRate, loanTerm]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Mortgage Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/mortgage-calculator",
          description:
            "Calculate monthly mortgage payments including principal, interest, taxes and insurance for real estate purchases.",
        }}
      />
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.articleChrome.mortgageCalculator")}</h1>
      <p className="text-gray-600 mb-8">{t("pages.mortgageCalculator.sub")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("pages.articleChrome.loanDetails")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label={t("pages.calculatorFields.homePrice")} value={homePrice} onChange={setHomePrice} min={1000} />
              <InputField label={t("pages.calculatorFields.downPayment")} value={downPayment} onChange={setDownPayment} min={0} />
              <InputField
                label={t("pages.articleChrome.loanTermYears")}
                value={loanTerm}
                onChange={setLoanTerm}
                min={1}
                max={30}
              />
              <InputField
                label={t("pages.articleChrome.interestRate")}
                value={interestRate}
                onChange={setInterestRate}
                min={0.1}
                max={30}
                step={0.125}
              />
            </div>
            <div className="pt-2">
              <CalculateButton />
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <ResultCard
              title={t("pages.mortgageCalculator.paymentAria")}
              value={`$${monthlyPayment.toFixed(2)}`}
              details={`${t("pages.calculatorResults.loanAmount")}: $${principal.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nTotal interest over ${loanTerm} years: $${totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n${t("pages.calculatorResults.totalPayment")}: $${totalPayment.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.mortgageCalculator.howToTitle")}</h2>
        <p>{t("pages.mortgageCalculator.howToA")}</p>
        <p>{t("pages.mortgageCalculator.howToB")}</p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">{t("pages.mortgageCalculator.peopleAsk")}</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("pages.mortgageCalculator.q1")}</h3>
            <p className="mt-1">{t("pages.mortgageCalculator.a1")}{" "}
              <Link href="/mortgage-calculator" className="text-blue-600 hover:underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("pages.mortgageCalculator.q2")}</h3>
            <p className="mt-1">{t("pages.mortgageCalculator.a2")}{" "}
              <Link
                href="/mortgage-calculator"
                className="text-blue-600 hover:underline"
              >{t("pages.articleChrome.amortizationCalculator")}</Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("pages.mortgageCalculator.q3")}</h3>
            <p className="mt-1">{t("pages.mortgageCalculator.a3")}{" "}
              <Link
                href="/down-payment-calculator"
                className="text-blue-600 hover:underline"
              >{t("pages.articleChrome.downPaymentCalculator")}</Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("pages.mortgageCalculator.q4")}</h3>
            <p className="mt-1">{t("pages.mortgageCalculator.a4")}{" "}
              <Link href="/mortgage-calculator" className="text-blue-600 hover:underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("pages.mortgageCalculator.q5")}</h3>
            <p className="mt-1">{t("pages.mortgageCalculator.a5")}{" "}
              <Link
                href="/refinance-calculator"
                className="text-blue-600 hover:underline"
              >{t("pages.mortgageCalculator.refinanceCalculator")}</Link>{" "}{t("pages.mortgageCalculator.beforeApply")}</p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("pages.mortgageCalculator.q6")}</h3>
            <p className="mt-1">{t("pages.mortgageCalculator.a6")}{" "}
              <Link
                href="/affordability-calculator"
                className="text-blue-600 hover:underline"
              >{t("pages.articleChrome.affordabilityCalculator")}</Link>{" "}{t("pages.mortgageCalculator.a6Tail")}{" "}
              <Link href="/mortgage-calculator" className="text-blue-600 hover:underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("pages.mortgageCalculator.q7")}</h3>
            <p className="mt-1">{t("pages.mortgageCalculator.a7")}{" "}
              <Link href="/mortgage-calculator" className="text-blue-600 hover:underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}{t("pages.mortgageCalculator.a7Tail")}{" "}
              <Link
                href="/mortgage-calculator"
                className="text-blue-600 hover:underline"
              >{t("pages.articleChrome.amortizationCalculator")}</Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("pages.mortgageCalculator.q8")}</h3>
            <p className="mt-1">{t("pages.mortgageCalculator.a8")}{" "}
              <Link href="/mortgage-calculator" className="text-blue-600 hover:underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t("pages.mortgageCalculator.q9")}</h3>
            <p className="mt-1">{t("pages.mortgageCalculator.a9")}{" "}
              <Link
                href="/rent-vs-buy-calculator"
                className="text-blue-600 hover:underline"
              >{t("pages.articleChrome.rentVsBuyCalculator")}</Link>
              .
            </p>
          </div>
        </div>

        <div className="mt-10">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">{t("pages.articleChrome.relatedCalculators")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href="/affordability-calculator"
              className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50"
            >{t("pages.articleChrome.affordabilityCalculator")}</Link>
            <Link
              href="/down-payment-calculator"
              className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50"
            >{t("pages.articleChrome.downPaymentCalculator")}</Link>
            <Link
              href="/refinance-calculator"
              className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50"
            >{t("pages.mortgageCalculator.refinanceCalculator")}</Link>
            <Link
              href="/rent-vs-buy-calculator"
              className="block rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-sm font-medium text-blue-600 hover:border-blue-400 hover:bg-blue-50"
            >{t("pages.articleChrome.rentVsBuyCalculator")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
