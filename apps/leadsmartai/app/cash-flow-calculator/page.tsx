"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";

export default function CashFlowCalculator() {
  const { t } = useTranslation("dashboard");
  const [monthlyRent, setMonthlyRent] = useState<number>(2500);
  const [monthlyMortgage, setMonthlyMortgage] = useState<number>(1800);
  const [propertyTax, setPropertyTax] = useState<number>(400);
  const [insurance, setInsurance] = useState<number>(150);
  const [hoa, setHoa] = useState<number>(0);
  const [maintenance, setMaintenance] = useState<number>(200);
  const [otherExpenses, setOtherExpenses] = useState<number>(100);
  const [vacancyMonths, setVacancyMonths] = useState<number>(0);

  const results = useMemo(() => {
    const income = monthlyRent * (12 - vacancyMonths);
    const expenses =
      monthlyMortgage * 12 +
      propertyTax * 12 +
      insurance * 12 +
      hoa * 12 +
      maintenance * 12 +
      otherExpenses * 12;
    const annualCashFlow = income - expenses;
    const monthlyCashFlow = annualCashFlow / 12;
    return {
      annualIncome: income,
      annualExpenses: expenses,
      annualCashFlow,
      monthlyCashFlow,
    };
  }, [
    monthlyRent,
    monthlyMortgage,
    propertyTax,
    insurance,
    hoa,
    maintenance,
    otherExpenses,
    vacancyMonths,
  ]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Rental Cash Flow Calculator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/cash-flow-calculator",
          description:
            "Estimate monthly and annual cash flow for rental properties based on income, expenses, mortgage and vacancy.",
        }}
      />
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.articleChrome.cashFlowCalculator")}</h1>
      <p className="text-gray-600 mb-8">{t("pages.cashFlowCalculator.sub")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t("pages.cashFlowCalculator.incomeExpenses")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label={t("pages.calculatorFields.monthlyRent")} value={monthlyRent} onChange={setMonthlyRent} min={0} />
              <InputField label={t("pages.calculatorFields.monthlyMortgage")} value={monthlyMortgage} onChange={setMonthlyMortgage} min={0} />
              <InputField label={t("pages.calculatorFields.propertyTaxMo")} value={propertyTax} onChange={setPropertyTax} min={0} />
              <InputField label={t("pages.calculatorFields.insuranceMo")} value={insurance} onChange={setInsurance} min={0} />
              <InputField label={t("pages.calculatorFields.hoaMo")} value={hoa} onChange={setHoa} min={0} />
              <InputField label={t("pages.calculatorFields.maintenanceMo")} value={maintenance} onChange={setMaintenance} min={0} />
              <InputField label={t("pages.calculatorFields.otherMo")} value={otherExpenses} onChange={setOtherExpenses} min={0} />
              <InputField label={t("pages.cashFlowCalculator.vacancyMonths")} value={vacancyMonths} onChange={setVacancyMonths} min={0} max={12} />
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
              title={t("pages.cashFlowCalculator.cashFlowAria")}
              value={`$${results.monthlyCashFlow.toFixed(2)}/mo`}
              details={`${t("pages.calculatorResults.annualIncome")}: $${results.annualIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n${t("pages.calculatorResults.annualExpenses")}: $${results.annualExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n${t("pages.calculatorResults.annualCashFlow")}: $${results.annualCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}\n${t("pages.calculatorResults.monthlyCashFlow")}: $${results.monthlyCashFlow.toFixed(2)}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.cashFlowCalculator.explainTitle")}</h2>
        <p>{t("pages.cashFlowCalculator.explainA")}</p>
        <p>{t("pages.cashFlowCalculator.explainB")}</p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">{t("pages.cashFlowCalculator.peopleAsk")}</h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.cashFlowCalculator.q1")}</h3>
          <p className="text-gray-600">{t("pages.cashFlowCalculator.a1")}{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">{t("pages.articleChrome.propertyAnalyzer")}</Link>{" "}{t("pages.cashFlowCalculator.a1Tail")}</p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.cashFlowCalculator.q2")}</h3>
          <p className="text-gray-600">{t("pages.cashFlowCalculator.a2")}{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">{t("pages.articleChrome.capRateCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.cashFlowCalculator.q3")}</h3>
          <p className="text-gray-600">{t("pages.cashFlowCalculator.a3")}{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">{t("pages.articleChrome.propertyAnalyzer")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.cashFlowCalculator.q4")}</h3>
          <p className="text-gray-600">{t("pages.cashFlowCalculator.a4")}{" "}
            <Link href="/roi-calculator" className="text-blue-600 underline">{t("pages.articleChrome.roiCalculator")}</Link>{" "}
            {t("common:conjunctions.and")}{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">{t("pages.articleChrome.capRateCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.cashFlowCalculator.q5")}</h3>
          <p className="text-gray-600">{t("pages.cashFlowCalculator.a5")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
            or{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.amortizationCalculator")}</Link>{" "}{t("pages.cashFlowCalculator.a5Tail")}</p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">{t("pages.articleChrome.relatedCalculators")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">{t("pages.articleChrome.capRateCalculator")}</Link>
            <Link href="/roi-calculator" className="text-blue-600 underline">{t("pages.articleChrome.roiCalculator")}</Link>
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">{t("pages.cashFlowCalculator.investmentAnalyzer")}</Link>
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
