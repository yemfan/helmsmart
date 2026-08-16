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
      <p className="text-gray-600 mb-8">
        Analyze rental property cash flow, cap rate, and simple ROI based on your assumptions.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Investment inputs
            </h2>
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
              title="Investment performance"
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
        <h2 className="text-xl font-semibold text-gray-900">
          Complete rental investment analysis
        </h2>
        <p>
          This property investment analyzer combines cash flow, net operating income
          (NOI), cap rate, and simple cash-on-cash ROI in one view. By entering the
          purchase price, rent, expenses, and mortgage payment, you can quickly see how
          a deal performs on both monthly and annual bases.
        </p>
        <p>
          Use the results to filter potential acquisitions, compare properties in
          different markets, and communicate returns to partners or clients. For deeper
          analysis, pair this tool with your own pro-forma models and local rent
          assumptions.
        </p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">
          People also ask about real estate investing
        </h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            What does a real estate investment analyzer help me understand?
          </h3>
          <p className="text-gray-600">
            A real estate investment analyzer helps you understand a rental property&apos;s cash
            flow, cap rate, and overall return based on your income, expenses, and financing
            assumptions.
            It brings together monthly numbers and long-term performance so you can compare deals
            side by side. You can use this tool along with our{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}
            and{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">{t("pages.articleChrome.capRateCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            What inputs do I need for a solid investment property analysis?
          </h3>
          <p className="text-gray-600">
            For a solid analysis you&apos;ll want purchase price, down payment or equity invested,
            mortgage payment, rent, operating expenses, expected vacancy, and a hold period.
            You can estimate loan payments with our{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
            and then plug those into this{" "}
            <Link
              href="/property-investment-analyzer"
              className="text-blue-600 underline"
            >{t("pages.articleChrome.propertyAnalyzer")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How is cash-on-cash return different from cap rate?
          </h3>
          <p className="text-gray-600">
            Cap rate looks at net operating income relative to purchase price and ignores financing,
            while cash-on-cash return measures annual cash flow relative to the actual cash you
            invested.
            This analyzer shows both so you can see how leverage affects your returns. You can also
            run quick cap rate checks using our{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">{t("pages.articleChrome.capRateCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How do I compare multiple rental properties with this tool?
          </h3>
          <p className="text-gray-600">
            To compare multiple rentals, run a separate analysis for each property using consistent
            assumptions for rent growth, expenses, and vacancy.
            Then compare metrics like monthly cash flow, cap rate, and cash-on-cash return across
            deals. For quick screening, you can also use the{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}
            before diving deeper here.
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How do interest rates and loan terms change my investment returns?
          </h3>
          <p className="text-gray-600">
            Interest rates and loan terms change your mortgage payment, which is one of the biggest
            drivers of cash flow and overall returns.
            Higher rates or shorter terms increase the payment and reduce cash flow, while lower
            rates or longer terms improve monthly numbers but can change total interest paid. You
            can model different loans with our{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
            or{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.amortizationCalculator")}</Link>{" "}
            and then bring those payments into this analyzer.
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            Should I prioritize cash flow, appreciation, or overall ROI?
          </h3>
          <p className="text-gray-600">
            The right priority depends on your strategy—some investors focus on strong cash flow
            today, while others prioritize appreciation and long-term equity growth.
            This analyzer helps you balance monthly income against overall returns so you can choose
            deals that match your goals. You can also isolate pure cash flow in the{" "}
            <Link href="/cash-flow-calculator" className="text-blue-600 underline">{t("pages.articleChrome.cashFlowCalculator")}</Link>{" "}
            or long-term returns in the{" "}
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
