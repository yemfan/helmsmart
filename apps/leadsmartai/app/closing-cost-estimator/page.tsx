"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import InputField from "../../components/InputField";
import ResultCard from "../../components/ResultCard";
import JsonLd from "../../components/JsonLd";

export default function ClosingCostEstimator() {
  const { t } = useTranslation("dashboard");
  const [homePrice, setHomePrice] = useState<number>(400000);
  const [loanAmount, setLoanAmount] = useState<number>(320000);
  const [originationPercent, setOriginationPercent] = useState<number>(1);
  const [titleInsurance, setTitleInsurance] = useState<number>(1500);
  const [appraisalFee, setAppraisalFee] = useState<number>(500);
  const [inspectionFee, setInspectionFee] = useState<number>(400);
  const [otherFees, setOtherFees] = useState<number>(800);

  const results = useMemo(() => {
    const origination = (loanAmount * originationPercent) / 100;
    const total =
      origination + titleInsurance + appraisalFee + inspectionFee + otherFees;
    const asPercentOfPrice = homePrice > 0 ? (total / homePrice) * 100 : 0;
    return {
      origination,
      titleInsurance,
      appraisalFee,
      inspectionFee,
      otherFees,
      total,
      asPercentOfPrice,
    };
  }, [
    homePrice,
    loanAmount,
    originationPercent,
    titleInsurance,
    appraisalFee,
    inspectionFee,
    otherFees,
  ]);

  return (
    <div className="container mx-auto px-4 py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Closing Cost Estimator",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/closing-cost-estimator",
          description:
            "Estimate real estate closing costs including origination, title, appraisal, inspection and other fees.",
        }}
      />
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">Closing Cost Estimator</h1>
      <p className="text-gray-600 mb-8">
        Estimate total closing costs based on loan and typical fees.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Cost inputs</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Home price ($)" value={homePrice} onChange={setHomePrice} min={1000} />
              <InputField label="Loan amount ($)" value={loanAmount} onChange={setLoanAmount} min={0} />
              <InputField label="Origination (%)" value={originationPercent} onChange={setOriginationPercent} min={0} max={5} step={0.25} />
              <InputField label="Title insurance ($)" value={titleInsurance} onChange={setTitleInsurance} min={0} />
              <InputField label="Appraisal fee ($)" value={appraisalFee} onChange={setAppraisalFee} min={0} />
              <InputField label="Inspection fee ($)" value={inspectionFee} onChange={setInspectionFee} min={0} />
              <InputField label="Other fees ($)" value={otherFees} onChange={setOtherFees} min={0} />
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
              title="Estimated closing costs"
              value={`$${results.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              details={`Origination: $${results.origination.toFixed(0)}\nTitle insurance: $${results.titleInsurance.toFixed(0)}\nAppraisal: $${results.appraisalFee.toFixed(0)}\nInspection: $${results.inspectionFee.toFixed(0)}\nOther: $${results.otherFees.toFixed(0)}\nTotal: $${results.total.toFixed(0)}\n(% of price: ${results.asPercentOfPrice.toFixed(2)}%)`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">
          Estimate real estate closing costs
        </h2>
        <p>
          This closing cost estimator aggregates common buyer fees such as loan
          origination charges, title insurance, appraisal and inspection fees, and other
          lender or title company costs. It also expresses the total as a percentage of
          the property&apos;s purchase price.
        </p>
        <p>
          Use this calculator to budget for cash due at closing and to compare quotes
          from different lenders or title providers. Investors and repeat buyers can
          quickly plug in local fee structures to forecast total transaction costs across
          multiple properties.
        </p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">
          People also ask about closing costs
        </h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            What are typical closing costs when buying a home?
          </h3>
          <p className="text-gray-600">
            Typical closing costs for buyers include lender fees like origination and underwriting,
            title insurance, appraisal and inspection fees, recording fees, and various third-party
            charges.
            They often add up to 2–5% of the purchase price depending on your location and loan
            type. You can estimate them quickly with this{" "}
            <Link href="/closing-cost-estimator" className="text-blue-600 underline">
              Closing Cost Estimator
            </Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How much of my home price should I budget for closing costs?
          </h3>
          <p className="text-gray-600">
            Many buyers budget around 2–5% of the purchase price for closing costs, though amounts
            can be higher in certain markets or for specific loan programs.
            This calculator shows your closing costs as both a dollar amount and a percentage of
            the home price so you can plan alongside your{" "}
            <Link href="/down-payment-calculator" className="text-blue-600 underline">{t("pages.articleChrome.downPaymentCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            What fees are included in a closing cost estimate?
          </h3>
          <p className="text-gray-600">
            Closing cost estimates typically include lender origination and discount points, title
            insurance, settlement or escrow fees, appraisal and inspection fees, recording fees,
            and other administrative charges.
            This tool lets you break out key components like origination, title, appraisal,
            inspection, and &quot;other&quot; fees so you can compare quotes from different
            lenders. You can then factor them into your overall budget with the{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            Can closing costs be rolled into my mortgage?
          </h3>
          <p className="text-gray-600">
            In many cases, some or all closing costs can be rolled into your mortgage or covered by
            a lender credit, though this may increase your interest rate or total amount financed.
            Use this estimator to see the dollar impact, and then model how rolling costs into the
            loan changes your payment with our{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
            or{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.amortizationCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            Who pays closing costs, the buyer or the seller?
          </h3>
          <p className="text-gray-600">
            Buyers usually pay most lender- and title-related closing costs, while sellers cover
            agent commissions and some transfer taxes or fees depending on the market.
            However, you can negotiate seller credits toward buyer closing costs. Estimating total
            fees here helps you decide what to request when writing offers or counteroffers.
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">
            How do closing costs affect how much house I can afford?
          </h3>
          <p className="text-gray-600">
            Closing costs increase the amount of cash you need at the time of purchase, which can
            reduce how much you can comfortably spend on the home itself.
            You should consider both your down payment and closing costs when planning your budget.
            Use this{" "}
            <Link href="/closing-cost-estimator" className="text-blue-600 underline">
              Closing Cost Estimator
            </Link>{" "}
            together with our{" "}
            <Link href="/affordability-calculator" className="text-blue-600 underline">{t("pages.articleChrome.affordabilityCalculator")}</Link>{" "}
            to see the full picture.
          </p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">{t("pages.articleChrome.relatedCalculators")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            <Link href="/down-payment-calculator" className="text-blue-600 underline">{t("pages.articleChrome.downPaymentCalculator")}</Link>
            <Link href="/affordability-calculator" className="text-blue-600 underline">{t("pages.articleChrome.affordabilityCalculator")}</Link>
            <Link href="/refinance-calculator" className="text-blue-600 underline">
              Refinance Calculator
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
