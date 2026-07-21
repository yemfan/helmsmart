"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";

export default function CashFlowCalculator() {
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
        </svg>
        Back to Home
      </Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">Cash Flow Calculator</h1>
      <p className="text-gray-600 mb-8">
        Estimate monthly and annual cash flow from rental property.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Income & expenses</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Monthly rent ($)" value={monthlyRent} onChange={setMonthlyRent} min={0} />
              <InputField label="Monthly mortgage ($)" value={monthlyMortgage} onChange={setMonthlyMortgage} min={0} />
              <InputField label="Property tax ($/mo)" value={propertyTax} onChange={setPropertyTax} min={0} />
              <InputField label="Insurance ($/mo)" value={insurance} onChange={setInsurance} min={0} />
              <InputField label="HOA ($/mo)" value={hoa} onChange={setHoa} min={0} />
              <InputField label="Maintenance ($/mo)" value={maintenance} onChange={setMaintenance} min={0} />
              <InputField label="Other ($/mo)" value={otherExpenses} onChange={setOtherExpenses} min={0} />
              <InputField label="Vacancy (months/yr)" value={vacancyMonths} onChange={setVacancyMonths} min={0} max={12} />
            </div>
            <div className="pt-2">
              <button
                type="button"
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Calculate
              </button>
            </div>
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <ResultCard
              title="Cash flow"
              value={`$${results.monthlyCashFlow.toFixed(2)}/mo`}
              details={`Annual income: $${results.annualIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nAnnual expenses: $${results.annualExpenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nAnnual cash flow: $${results.annualCashFlow.toLocaleString(undefined, { maximumFractionDigits: 0 })}\nMonthly cash flow: $${results.monthlyCashFlow.toFixed(2)}`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">
          Analyze rental property cash flow
        </h2>
        <p>
          The cash flow calculator summarizes rental income, operating expenses, and
          financing costs to show monthly and annual cash flow for a property. It
          includes vacancy assumptions along with common expenses like taxes, insurance,
          maintenance, HOA dues, and other recurring costs.
        </p>
        <p>
          Investors use this tool to screen deals, stress-test different rent levels, and
          understand how financing terms affect returns. It pairs well with cap rate and
          ROI calculators to provide a complete rental property analysis workflow.
        </p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">
          People also ask about rental cash flow
        </h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            What does a rental cash flow calculator tell me?
          </h3>
          <p className="text-gray-600">
            A rental cash flow calculator tells you how much money a property is likely to make or
            lose each month and year after you subtract realistic expenses from rental income.
            It helps you see whether a deal produces positive or negative cash flow before you move
            forward. You can pair these results with returns from our{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">
              Property Investment Analyzer
            </Link>{" "}
            to evaluate overall performance.
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            Which expenses should I include in a cash flow analysis?
          </h3>
          <p className="text-gray-600">
            A solid cash flow analysis should include your mortgage payment, property taxes,
            insurance, HOA dues, maintenance, property management, utilities you cover, reserves,
            and any other recurring costs.
            This calculator lets you break out key expenses so you can see how each line item
            affects your net income. You can then convert net operating income into returns using
            our{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">
              Cap Rate Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How does vacancy impact rental cash flow?
          </h3>
          <p className="text-gray-600">
            Vacancy reduces your effective rental income because you collect fewer months of rent
            each year, which can significantly lower annual cash flow.
            In this tool you can model vacancy in months per year so you can stress-test deals in
            softer markets. For longer-term projections, you can also model returns in our{" "}
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">
              Property Investment Analyzer
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            Is positive cash flow the only thing that matters for a rental property?
          </h3>
          <p className="text-gray-600">
            Positive cash flow is important for stability and risk management, but long-term
            returns also come from loan paydown and property appreciation.
            A property with modest cash flow may still produce strong overall ROI when you factor in
            equity growth. You can combine cash flow from this tool with return metrics from our{" "}
            <Link href="/roi-calculator" className="text-blue-600 underline">
              ROI Calculator
            </Link>{" "}
            and{" "}
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">
              Cap Rate Calculator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How do mortgage terms affect rental cash flow?
          </h3>
          <p className="text-gray-600">
            Your interest rate, loan term, and amortization schedule all influence your monthly
            mortgage payment, which is a major driver of cash flow.
            Lower rates or longer terms usually improve monthly cash flow but change your total
            interest paid. You can estimate payments with our{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">
              Mortgage Calculator
            </Link>{" "}
            or{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">
              Loan Amortization Calculator
            </Link>{" "}
            and plug those numbers back into this cash flow tool.
          </p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">Related Calculators</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/cap-rate-calculator" className="text-blue-600 underline">
              Cap Rate Calculator
            </Link>
            <Link href="/roi-calculator" className="text-blue-600 underline">
              ROI Calculator
            </Link>
            <Link href="/property-investment-analyzer" className="text-blue-600 underline">
              Investment Analyzer
            </Link>
            <Link href="/mortgage-calculator" className="text-blue-600 underline">
              Mortgage Calculator
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
