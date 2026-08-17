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

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.closingCostEstimator.h1")}</h1>
      <p className="text-gray-600 mb-8">{t("pages.closingCostEstimator.sub")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("pages.closingCostEstimator.costInputs")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField label="Home price ($)" value={homePrice} onChange={setHomePrice} min={1000} />
              <InputField label="Loan amount ($)" value={loanAmount} onChange={setLoanAmount} min={0} />
              <InputField label={t("pages.closingCostEstimator.origination")} value={originationPercent} onChange={setOriginationPercent} min={0} max={5} step={0.25} />
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
              title={t("pages.closingCostEstimator.resultsAria")}
              value={`$${results.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              details={`Origination: $${results.origination.toFixed(0)}\nTitle insurance: $${results.titleInsurance.toFixed(0)}\nAppraisal: $${results.appraisalFee.toFixed(0)}\nInspection: $${results.inspectionFee.toFixed(0)}\nOther: $${results.otherFees.toFixed(0)}\nTotal: $${results.total.toFixed(0)}\n(% of price: ${results.asPercentOfPrice.toFixed(2)}%)`}
            />
          </div>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.closingCostEstimator.explainTitle")}</h2>
        <p>{t("pages.closingCostEstimator.explainA")}</p>
        <p>{t("pages.closingCostEstimator.explainB")}</p>
      </section>

      <section className="mt-16 max-w-4xl space-y-6 text-sm text-gray-700 text-left">
        <h2 className="text-2xl font-semibold text-gray-900">{t("pages.closingCostEstimator.peopleAsk")}</h2>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.closingCostEstimator.q1")}</h3>
          <p className="text-gray-600">{t("pages.closingCostEstimator.a1")}{" "}
            <Link href="/closing-cost-estimator" className="text-blue-600 underline">{t("pages.closingCostEstimator.h1")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.closingCostEstimator.q2")}</h3>
          <p className="text-gray-600">{t("pages.closingCostEstimator.a2")}{" "}
            <Link href="/down-payment-calculator" className="text-blue-600 underline">{t("pages.articleChrome.downPaymentCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.closingCostEstimator.q3")}</h3>
          <p className="text-gray-600">{t("pages.closingCostEstimator.a3")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.closingCostEstimator.q4")}</h3>
          <p className="text-gray-600">{t("pages.closingCostEstimator.a4")}{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>{" "}
            or{" "}
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.amortizationCalculator")}</Link>
            .
          </p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.closingCostEstimator.q5")}</h3>
          <p className="text-gray-600">{t("pages.closingCostEstimator.a5")}</p>
        </article>

        <article className="space-y-2">
          <h3 className="text-lg font-semibold">{t("pages.closingCostEstimator.q6")}</h3>
          <p className="text-gray-600">{t("pages.closingCostEstimator.a6")}{" "}
            <Link href="/closing-cost-estimator" className="text-blue-600 underline">{t("pages.closingCostEstimator.h1")}</Link>{" "}{t("pages.closingCostEstimator.togetherWith")}{" "}
            <Link href="/affordability-calculator" className="text-blue-600 underline">{t("pages.articleChrome.affordabilityCalculator")}</Link>{" "}{t("pages.closingCostEstimator.fullPicture")}</p>
        </article>

        <div className="mt-12">
          <h3 className="text-xl font-semibold mb-4">{t("pages.articleChrome.relatedCalculators")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/mortgage-calculator" className="text-blue-600 underline">{t("pages.articleChrome.mortgageCalculator")}</Link>
            <Link href="/down-payment-calculator" className="text-blue-600 underline">{t("pages.articleChrome.downPaymentCalculator")}</Link>
            <Link href="/affordability-calculator" className="text-blue-600 underline">{t("pages.articleChrome.affordabilityCalculator")}</Link>
            <Link href="/refinance-calculator" className="text-blue-600 underline">{t("pages.closingCostEstimator.refinanceCalculator")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
