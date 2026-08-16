"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import RequireAuthGate from "../../components/RequireAuthGate";
import { intlLocale } from "@/lib/i18n/locale";

type PropertyInputs = {
  address: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  yearBuilt: number | undefined;
  lotSize: number | undefined;
  propertyType: string;
};

type Comparable = {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  soldPrice: number;
  soldDate: string;
};

const SAMPLE_COMPS: Comparable[] = [
  {
    address: "123 Oakridge Dr",
    beds: 3,
    baths: 2,
    sqft: 1850,
    soldPrice: 815000,
    soldDate: "2025-12-10",
  },
  {
    address: "456 Pinecrest Ave",
    beds: 4,
    baths: 3,
    sqft: 2100,
    soldPrice: 842000,
    soldDate: "2025-11-22",
  },
  {
    address: "789 Maple Ln",
    beds: 3,
    baths: 2,
    sqft: 1750,
    soldPrice: 799000,
    soldDate: "2025-11-05",
  },
  {
    address: "102 Cedar Ct",
    beds: 4,
    baths: 3,
    sqft: 2250,
    soldPrice: 861000,
    soldDate: "2025-10-18",
  },
  {
    address: "305 Birch Way",
    beds: 3,
    baths: 2,
    sqft: 1900,
    soldPrice: 828000,
    soldDate: "2025-10-01",
  },
];

export default function AiCmaAnalyzerPage() {
  return (
    <RequireAuthGate>
      <AiCmaAnalyzerPageInner />
    </RequireAuthGate>
  );
}

function AiCmaAnalyzerPageInner() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [inputs, setInputs] = useState<PropertyInputs>({
    address: "",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1900,
    yearBuilt: 1998,
    lotSize: 6000,
    propertyType: "Single-family",
  });

  const [comps] = useState<Comparable[]>(SAMPLE_COMPS);

  const priceStats = useMemo(() => {
    if (!comps.length) return null;

    const prices = comps.map((c) => c.soldPrice).sort((a, b) => a - b);
    const avgPrice =
      prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const medianPrice =
      prices.length % 2 === 1
        ? prices[(prices.length - 1) / 2]
        : (prices[prices.length / 2 - 1] +
            prices[prices.length / 2]) /
          2;

    const avgPpsf =
      comps.reduce(
        (sum, c) => sum + c.soldPrice / Math.max(c.sqft, 1),
        0
      ) / comps.length;

    const suggestedLow = avgPrice * 0.97;
    const suggestedHigh = avgPrice * 1.03;

    const spread = suggestedHigh - suggestedLow;
    const spreadRatio = spread / Math.max(avgPrice, 1);
    const compCountFactor = Math.min(comps.length / 8, 1);
    const rawConfidence =
      70 * (1 - spreadRatio) + 30 * compCountFactor;

    return {
      avgPrice,
      medianPrice,
      avgPpsf,
      suggestedLow,
      suggestedHigh,
      confidenceScore: Math.max(0, Math.min(100, rawConfidence)),
    };
  }, [comps]);

  const handleAnalyzeProperty = () => {
    alert(
      "CMA generated using sample comparable sales. This is illustrative only — not a substitute for live MLS data."
    );
  };

  const handleExportPdf = () => {
    alert(
      "Direct PDF export isn't available in demo mode. Use your browser's Print to PDF to save this CMA."
    );
  };

  const marketTrends = useMemo(
    () => ({
      medianPrice: priceStats?.medianPrice ?? 0,
      averageDom: 21,
      status: "Seller" as "Seller" | "Buyer" | "Balanced",
    }),
    [priceStats]
  );

  const confidenceScore = priceStats?.confidenceScore ?? 0;

  const aiSummary = useMemo(() => {
    if (!priceStats) {
      return "Once comparable sales and live market data are available, this section will summarize how the subject property fits within the local market and provide an estimated value range.";
    }

    const { avgPrice, medianPrice, suggestedLow, suggestedHigh } =
      priceStats;
    const midpoint = (suggestedLow + suggestedHigh) / 2;

    const statusText =
      marketTrends.status === "Seller"
        ? "Current conditions appear to favor sellers, with relatively low inventory and solid buyer demand."
        : marketTrends.status === "Buyer"
        ? "Current conditions appear to favor buyers, with more inventory and longer days on market."
        : "Market conditions appear balanced between buyers and sellers.";

    return `Based on recent comparable sales, similar properties in this area are closing around an average of $${avgPrice.toLocaleString(
      undefined,
      { maximumFractionDigits: 0 }
    )} with a median of $${medianPrice.toLocaleString(
      undefined,
      { maximumFractionDigits: 0 }
    )}. For the subject property, an estimated market value in the range of $${suggestedLow.toLocaleString(
      undefined,
      { maximumFractionDigits: 0 }
    )} to $${suggestedHigh.toLocaleString(
      undefined,
      { maximumFractionDigits: 0 }
    )} (midpoint roughly $${midpoint.toLocaleString(
      undefined,
      { maximumFractionDigits: 0 }
    )}) appears reasonable given the current set of comparables. ${statusText} As always, verify property condition, neighborhood trends, and any unique features before final pricing decisions.`;
  }, [priceStats, marketTrends.status]);

  return (
    <div className="container mx-auto px-4 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      {/*
       * Demo banner — TVR-011 / BF-034. The Comparable Sales table
       * and AI Market Analysis on this page render hardcoded sample
       * data (real backend not yet wired). Without a prominent
       * disclosure, agents could mistake these numbers for live
       * analysis and quote them to clients — AVM accuracy is
       * regulated under California AB 2863.
       *
       * Remove this banner only when the page is connected to a
       * real comp source (e.g., Rentcast / MLS) end-to-end.
       */}
      <div
        role="status"
        aria-label={t("pages.aiCmaAnalyzer.demoAria")}
        className="mb-6 flex items-start gap-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-900 shadow-sm"
      >
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM3 16.5l9-13.5 9 13.5H3z" />
        </svg>
        <div className="text-sm">
          <strong className="block font-semibold">{t("pages.aiCmaAnalyzer.demoTitle")}</strong>
          <span className="mt-0.5 block text-amber-800">{t("pages.aiCmaAnalyzer.demoBody")}</span>
        </div>
      </div>

      {/* Hero section */}
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-blue-600 mb-3">{t("pages.aiCmaAnalyzer.h1")}</h1>
        <p className="text-gray-600 max-w-3xl">{t("pages.aiCmaAnalyzer.sub")}</p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Left column: address + property details + report generator */}
        <div className="space-y-6">
          {/* Address Input */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("pages.aiCmaAnalyzer.propertyAddress")}</h2>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-gray-700">{t("pages.articleChrome.address")}</span>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="123 Main St, Los Angeles, CA"
                  value={inputs.address}
                  onChange={(e) =>
                    setInputs((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={handleAnalyzeProperty}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >{t("pages.aiCmaAnalyzer.analyze")}</button>
            </div>
            <p className="text-xs text-gray-500 mt-1">{t("pages.aiCmaAnalyzer.demoAddressNote")}</p>
          </section>

          {/* Property Details */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("pages.aiCmaAnalyzer.propertyDetails")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberInput
                label={t("pages.aiCmaAnalyzer.bedrooms")}
                value={inputs.bedrooms}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, bedrooms: v }))
                }
                min={0}
              />
              <NumberInput
                label={t("pages.aiCmaAnalyzer.bathrooms")}
                value={inputs.bathrooms}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, bathrooms: v }))
                }
                min={0}
                step={0.5}
              />
              <NumberInput
                label={t("pages.aiCmaAnalyzer.squareFeet")}
                value={inputs.squareFeet}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, squareFeet: v }))
                }
                min={0}
              />
              <NumberInput
                label={t("pages.articleChrome.yearBuilt")}
                value={inputs.yearBuilt ?? ""}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, yearBuilt: v }))
                }
                min={1800}
              />
              <NumberInput
                label={t("pages.aiCmaAnalyzer.lotSize")}
                value={inputs.lotSize ?? ""}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, lotSize: v }))
                }
                min={0}
              />
            </div>
            <label className="block text-sm mt-3">
              <span className="text-gray-700">{t("pages.aiCmaAnalyzer.propertyType")}</span>
              <select
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={inputs.propertyType}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    propertyType: e.target.value,
                  }))
                }
              >
                <option>{t("pages.aiCmaAnalyzer.singleFamily")}</option>
                <option>{t("pages.aiCmaAnalyzer.condo")}</option>
                <option>{t("pages.aiCmaAnalyzer.townhome")}</option>
                <option>{t("pages.aiCmaAnalyzer.multi24")}</option>
                <option>{t("pages.aiCmaAnalyzer.multi5")}</option>
              </select>
            </label>
          </section>

          {/* Report Generator */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("pages.aiCmaAnalyzer.reportGenerator")}</h2>
            <p className="text-sm text-gray-600">{t("pages.aiCmaAnalyzer.reportGeneratorBody")}</p>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center justify-center rounded-md border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >{t("pages.aiCmaAnalyzer.downloadPdf")}</button>
          </section>
        </div>

        {/* Right column: comps, price analysis, trends, AI analysis */}
        <div className="space-y-6">
          {/* Comparable Sales Table */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{t("pages.articleChrome.comparableSales")}</h2>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{t("pages.aiCmaAnalyzer.sampleData")}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600">
                    <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.address")}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.beds")}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.baths")}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.sqft")}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.aiCmaAnalyzer.soldPrice")}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.aiCmaAnalyzer.pricePerSqft")}</th>
                    <th className="px-3 py-2 font-semibold">{t("pages.aiCmaAnalyzer.soldDate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {comps.map((comp, idx) => {
                    const ppsf =
                      comp.soldPrice / Math.max(comp.sqft, 1);
                    return (
                      <tr
                        key={idx}
                        className="border-t border-gray-100 hover:bg-gray-50"
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          {comp.address}
                        </td>
                        <td className="px-3 py-2">{comp.beds}</td>
                        <td className="px-3 py-2">{comp.baths}</td>
                        <td className="px-3 py-2">
                          {comp.sqft.toLocaleString(locale)}
                        </td>
                        <td className="px-3 py-2">
                          ${comp.soldPrice.toLocaleString(locale)}
                        </td>
                        <td className="px-3 py-2">
                          ${ppsf.toFixed(0)}/sqft
                        </td>
                        <td className="px-3 py-2">
                          {new Date(
                            comp.soldDate
                          ).toLocaleDateString(locale)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Price Analysis Section */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("pages.aiCmaAnalyzer.priceAnalysis")}</h2>
            {priceStats ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <MetricCard
                    label={t("pages.aiCmaAnalyzer.avgSold")}
                    value={`$${priceStats.avgPrice.toLocaleString(
                      undefined,
                      { maximumFractionDigits: 0 }
                    )}`}
                  />
                  <MetricCard
                    label={t("pages.aiCmaAnalyzer.medianSold")}
                    value={`$${priceStats.medianPrice.toLocaleString(
                      undefined,
                      { maximumFractionDigits: 0 }
                    )}`}
                  />
                  <MetricCard
                    label={t("pages.aiCmaAnalyzer.avgPerSqft")}
                    value={`$${priceStats.avgPpsf.toFixed(0)}/sqft`}
                  />
                  <MetricCard
                    label={t("pages.aiCmaAnalyzer.estRange")}
                    value={`$${priceStats.suggestedLow.toLocaleString(
                      undefined,
                      { maximumFractionDigits: 0 }
                    )} – $${priceStats.suggestedHigh.toLocaleString(
                      undefined,
                      { maximumFractionDigits: 0 }
                    )}`}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">{t("pages.aiCmaAnalyzer.priceAnalysisEmpty")}</p>
            )}
          </section>

          {/* Market Trends Section */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("pages.aiCmaAnalyzer.marketTrends")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <MetricCard
                label={t("pages.aiCmaAnalyzer.medianArea")}
                value={
                  marketTrends.medianPrice
                    ? `$${marketTrends.medianPrice.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 0 }
                      )}`
                    : "N/A"
                }
              />
              <MetricCard
                label={t("pages.aiCmaAnalyzer.avgDom")}
                value={`${marketTrends.averageDom} days`}
              />
              <MetricCard
                label={t("pages.aiCmaAnalyzer.marketStatus")}
                value={`${marketTrends.status} Market`}
              />
            </div>
          </section>

          {/* AI Market Analysis + Confidence */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4 text-sm text-gray-700">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{t("pages.aiCmaAnalyzer.aiAnalysis")}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{t("pages.aiCmaAnalyzer.confidence")}</span>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {confidenceScore.toFixed(0)} / 100
                </span>
              </div>
            </div>
            <p>{aiSummary}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

type NumberInputProps = {
  label: string;
  value: number | string;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: NumberInputProps) {
  return (
    <label className="block text-sm">
      <span className="text-gray-700">{label}</span>
      <input
        type="number"
        className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
};

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-gray-900">
        {value}
      </div>
    </div>
  );
}

