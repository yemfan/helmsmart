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

export default function RentVsBuyCalculator() {
  const { t } = useTranslation("dashboard");
  const [monthlyRent, setMonthlyRent] = useState<number>(2000);
  const [homePrice, setHomePrice] = useState<number>(400000);
  const [downPayment, setDownPayment] = useState<number>(80000);
  const [mortgageRate, setMortgageRate] = useState<number>(6.5);
  const [propertyTaxRate, setPropertyTaxRate] = useState<number>(1.2);
  const [expectedAppreciation, setExpectedAppreciation] = useState<number>(3);
  const [yearsToStay, setYearsToStay] = useState<number>(5);

  const { totalCostRenting, totalCostBuying, recommendation } = useMemo(() => {
    const totalCostRenting = monthlyRent * 12 * yearsToStay;
    const loanAmount = Math.max(0, homePrice - downPayment);
    const monthlyPmt = pmt(loanAmount, mortgageRate, 30);
    const annualPropertyTax = (homePrice * propertyTaxRate) / 100;
    const totalCostBuying =
      downPayment + monthlyPmt * 12 * yearsToStay + annualPropertyTax * yearsToStay;
    const recommendation = totalCostRenting < totalCostBuying ? "Rent" : "Buy";
    return {
      totalCostRenting,
      totalCostBuying,
      recommendation,
    };
  }, [
    monthlyRent,
    homePrice,
    downPayment,
    mortgageRate,
    propertyTaxRate,
    yearsToStay,
  ]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Rent vs Buy Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/rent-vs-buy-calculator",
          description:
            "Compare the total cost of renting versus buying a home over your planned time horizon.",
        }}
      />
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.articleChrome.rentVsBuyCalculator")}</h1>
      <p className="text-gray-600 mb-8">{t("pages.rentVsBuy.sub")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("pages.rentVsBuy.assumptions")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                label="Monthly rent ($)"
                value={monthlyRent}
                onChange={setMonthlyRent}
                min={0}
              />
              <InputField
                label="Home price ($)"
                value={homePrice}
                onChange={setHomePrice}
                min={1000}
              />
              <InputField
                label="Down payment ($)"
                value={downPayment}
                onChange={setDownPayment}
                min={0}
              />
              <InputField
                label={t("pages.rentVsBuy.mortgageRate")}
                value={mortgageRate}
                onChange={setMortgageRate}
                min={0.1}
                max={30}
                step={0.125}
              />
              <InputField
                label={t("pages.rentVsBuy.propertyTaxRate")}
                value={propertyTaxRate}
                onChange={setPropertyTaxRate}
                min={0}
                max={10}
                step={0.1}
              />
              <InputField
                label={t("pages.rentVsBuy.appreciation")}
                value={expectedAppreciation}
                onChange={setExpectedAppreciation}
                min={-5}
                max={20}
                step={0.5}
              />
              <InputField
                label={t("pages.rentVsBuy.yearsStaying")}
                value={yearsToStay}
                onChange={setYearsToStay}
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
              title={t("pages.rentVsBuy.comparisonAria")}
              value={recommendation}
              details={`Total cost renting (${yearsToStay} yrs): $${totalCostRenting.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nTotal cost buying (${yearsToStay} yrs): $${totalCostBuying.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nRecommendation: ${recommendation}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.rentVsBuy.explainTitle")}</h2>
        <p>{t("pages.rentVsBuy.explainA")}</p>
        <p>{t("pages.rentVsBuy.explainB")}</p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">{t("pages.rentVsBuy.peopleAsk")}</h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.rentVsBuy.q1")}</h3>
          <p className="text-gray-600">{t("pages.rentVsBuy.a1")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
            and{" "}
            <Link href="/affordability-calculator" className="text-blue-600 underline">{t("pages.articleChrome.affordabilityCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.rentVsBuy.q2")}</h3>
          <p className="text-gray-600">{t("pages.rentVsBuy.a2")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.rentVsBuy.q3")}</h3>
          <p className="text-gray-600">{t("pages.rentVsBuy.a3")}{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}
            and{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">{t("pages.articleChrome.capRateCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.rentVsBuy.q4")}</h3>
          <p className="text-gray-600">{t("pages.rentVsBuy.a4")}{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">{t("pages.rentVsBuy.investmentAnalyzer")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.rentVsBuy.q5")}</h3>
          <p className="text-gray-600">{t("pages.rentVsBuy.a5")}{" "}
            <Link href="/down-payment-calculator" className="text-blue-600 underline">{t("pages.articleChrome.downPaymentCalculator")}</Link>{" "}
            and{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}{t("pages.rentVsBuy.a5Tail")}</p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">{t("pages.articleChrome.relatedCalculators")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            <Link href="/affordability-calculator" className="text-blue-600 underline">{t("pages.articleChrome.affordabilityCalculator")}</Link>
            <Link href="/down-payment-calculator" className="text-blue-600 underline">{t("pages.articleChrome.downPaymentCalculator")}</Link>
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
