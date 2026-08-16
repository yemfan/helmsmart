"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";

export default function HOAFeeTracker() {
  const { t } = useTranslation("dashboard");
  const [monthlyHoa, setMonthlyHoa] = useState<number>(350);
  const [annualIncreasePercent, setAnnualIncreasePercent] = useState<number>(3);
  const [years, setYears] = useState<number>(10);

  const results = useMemo(() => {
    let total = 0;
    let current = monthlyHoa * 12;
    for (let y = 0; y < years; y++) {
      total += current;
      current *= 1 + annualIncreasePercent / 100;
    }
    const firstYearTotal = monthlyHoa * 12;
    const lastYearMonthly = monthlyHoa * Math.pow(1 + annualIncreasePercent / 100, years - 1);
    return {
      totalHoaOverPeriod: total,
      firstYearTotal,
      lastYearMonthly,
      lastYearAnnual: lastYearMonthly * 12,
    };
  }, [monthlyHoa, annualIncreasePercent, years]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "HOA Fee Tracker",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/hoa-fee-tracker",
          description:
            "Project long-term HOA costs with annual increases to understand the impact of homeowners association fees.",
        }}
      />
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">HOA Fee Tracker</h1>
      <p className="text-gray-600 mb-8">
        Project total HOA costs over time with annual increases.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">HOA assumptions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Monthly HOA ($)" value={monthlyHoa} onChange={setMonthlyHoa} min={0} />
              <InputField label="Annual increase (%)" value={annualIncreasePercent} onChange={setAnnualIncreasePercent} min={0} max={20} step={0.5} />
              <InputField label="Years" value={years} onChange={setYears} min={1} max={30} />
            </div>
            <button
              type="button"
              className="mt-6 w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >{t("pages.articleChrome.calculate")}</button>
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <ResultCard
              title="HOA projection"
              value={`$${results.totalHoaOverPeriod.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              details={`Total HOA over ${years} years: $${results.totalHoaOverPeriod.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nFirst year total: $${results.firstYearTotal.toFixed(0)}\nLast year (monthly): $${results.lastYearMonthly.toFixed(2)}\nLast year (annual): $${results.lastYearAnnual.toFixed(0)}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">
          Understand long-term HOA costs
        </h2>
        <p>
          The HOA fee tracker projects how much you will pay in homeowners association
          dues over time, including expected annual increases. It calculates the total
          HOA cost over your ownership period and highlights how rising fees affect
          long-term affordability.
        </p>
        <p>
          Buyers, condo owners, and townhome investors can use this calculator to factor
          HOA charges into overall housing costs, compare communities, and anticipate
          the impact of regular fee increases on cash flow and net returns.
        </p>
      </section>
    </div>
  );
}
