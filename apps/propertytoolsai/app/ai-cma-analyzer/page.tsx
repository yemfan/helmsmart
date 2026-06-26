"use client";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ToolLeadGate } from "@/components/ToolLeadGate";
import { SaveResultsButton } from "@/components/SaveResultsButton";

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

type AiValuation = {
  estimatedValue: number;
  low: number;
  high: number;
  avgPricePerSqft: number;
  confidenceScore: number | null;
};

type AiSource = { title: string; url: string };

export default function AiCmaAnalyzerPage() {
  return <AiCmaAnalyzerPageInner />;
}

function AiCmaAnalyzerPageInner() {
  const [inputs, setInputs] = useState<PropertyInputs>({
    address: "",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1900,
    yearBuilt: 1998,
    lotSize: 6000,
    propertyType: "Single-family",
  });

  const [comps, setComps] = useState<Comparable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [valuation, setValuation] = useState<AiValuation | null>(null);
  const [aiSummaryText, setAiSummaryText] = useState<string | null>(null);
  const [sources, setSources] = useState<AiSource[]>([]);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);

  const priceStats = useMemo(() => {
    if (!comps.length && !valuation) return null;

    const prices = comps
      .map((c) => c.soldPrice)
      .filter((p) => p > 0)
      .sort((a, b) => a - b);
    const compAvg = prices.length
      ? prices.reduce((sum, p) => sum + p, 0) / prices.length
      : 0;
    const avgPrice = valuation?.estimatedValue || compAvg;
    const medianPrice = prices.length
      ? prices.length % 2 === 1
        ? prices[(prices.length - 1) / 2]
        : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : avgPrice;

    const avgPpsf =
      valuation?.avgPricePerSqft ||
      (comps.length
        ? comps.reduce((sum, c) => sum + c.soldPrice / Math.max(c.sqft, 1), 0) /
          comps.length
        : 0);

    // Prefer the AI engine's grounded range; fall back to a ±3% band on the
    // comp average when (rarely) the model returned comps but no range.
    const suggestedLow = valuation?.low || avgPrice * 0.97;
    const suggestedHigh = valuation?.high || avgPrice * 1.03;

    let confidenceScore: number;
    if (valuation?.confidenceScore != null) {
      confidenceScore = valuation.confidenceScore;
    } else {
      const spread = suggestedHigh - suggestedLow;
      const spreadRatio = spread / Math.max(avgPrice, 1);
      const compCountFactor = Math.min(comps.length / 8, 1);
      confidenceScore = Math.max(
        0,
        Math.min(100, 70 * (1 - spreadRatio) + 30 * compCountFactor)
      );
    }

    return { avgPrice, medianPrice, avgPpsf, suggestedLow, suggestedHigh, confidenceScore };
  }, [comps, valuation]);

  const handleAnalyzeProperty = async () => {
    const address = inputs.address.trim();
    if (!address) {
      setError("Enter a property address first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cma/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          beds: inputs.bedrooms,
          baths: inputs.bathrooms,
          sqft: inputs.squareFeet,
          yearBuilt: inputs.yearBuilt,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.snapshot) {
        throw new Error(
          json?.error ?? "Could not generate a CMA for this address. Try a more complete address."
        );
      }
      const snap = json.snapshot;
      const mapped: Comparable[] = (Array.isArray(snap.comps) ? snap.comps : []).map(
        (c: Record<string, unknown>) => ({
          address: String(c.address ?? ""),
          beds: Number(c.beds ?? 0),
          baths: Number(c.baths ?? 0),
          sqft: Number(c.sqft ?? 0),
          soldPrice: Number(c.price ?? 0),
          soldDate: String(c.soldDate ?? ""),
        })
      );
      setComps(mapped);
      setValuation(snap.valuation ?? null);
      setAiSummaryText(typeof snap.summary === "string" ? snap.summary : null);
      setSources(Array.isArray(snap.sources) ? snap.sources : []);
      setDisclaimer(typeof snap.disclaimer === "string" ? snap.disclaimer : null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not generate a CMA.");
      setComps([]);
      setValuation(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = () => {
    alert(
      "PDF export coming soon. For now, use your browser's Print to PDF to save this CMA."
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
    // Prefer the engine's own grounded summary when present.
    if (aiSummaryText) return aiSummaryText;
    if (!priceStats) {
      return "Enter an address and click Analyze Property to generate a CMA from real, recently sold comparables found via live web search.";
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
  }, [aiSummaryText, priceStats, marketTrends.status]);

  return (
    <div className="w-full max-w-6xl py-10">
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
        </svg>
        Back to Home
      </Link>

      {/* Hero section */}
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-blue-600 mb-3">
          AI CMA Analyzer – Comparative Market Analysis Tool
        </h1>
        <p className="text-gray-600 max-w-3xl">
          Estimate property value using comparable home sales and AI market
          analysis. Perfect for real estate agents, home sellers, and buyers.
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Left column: address + property details + report generator */}
        <div className="space-y-6">
          {/* Address Input */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Property Address
            </h2>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-gray-700">Address</span>
                <div className="mt-1">
                  <AddressAutocomplete
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="123 Main St, Los Angeles, CA"
                    value={inputs.address}
                    onChange={(next) =>
                      setInputs((prev) => ({
                        ...prev,
                        address: next,
                      }))
                    }
                  />
                </div>
              </label>
              <button
                type="button"
                onClick={handleAnalyzeProperty}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Analyzing…" : "Analyze Property"}
              </button>
              {error ? (
                <p className="text-xs font-medium text-red-600">{error}</p>
              ) : null}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              We search the web for recent comparable sales near this address
              and build a value range from real, cited comps (~15–40s).
            </p>
          </section>

          {/* Property Details */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Property Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberInput
                label="Bedrooms"
                value={inputs.bedrooms}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, bedrooms: v }))
                }
                min={0}
              />
              <NumberInput
                label="Bathrooms"
                value={inputs.bathrooms}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, bathrooms: v }))
                }
                min={0}
                step={0.5}
              />
              <NumberInput
                label="Square Feet"
                value={inputs.squareFeet}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, squareFeet: v }))
                }
                min={0}
              />
              <NumberInput
                label="Year Built"
                value={inputs.yearBuilt ?? ""}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, yearBuilt: v }))
                }
                min={1800}
              />
              <NumberInput
                label="Lot Size (sqft)"
                value={inputs.lotSize ?? ""}
                onChange={(v) =>
                  setInputs((prev) => ({ ...prev, lotSize: v }))
                }
                min={0}
              />
            </div>
            <label className="block text-sm mt-3">
              <span className="text-gray-700">Property Type</span>
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
                <option>Single-family</option>
                <option>Condo</option>
                <option>Townhome</option>
                <option>Multi-family (2–4 units)</option>
                <option>Multi-family (5+ units)</option>
              </select>
            </label>
          </section>

          {/* Report Generator */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              CMA Report Generator
            </h2>
            <p className="text-sm text-gray-600">
              Generate a CMA report you can share with clients or save for
              your records. Future versions will support full branded PDFs
              with your logo and contact information.
            </p>
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center justify-center rounded-md border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              Download CMA Report (PDF)
            </button>
          </section>
        </div>

        {/* Right column: comps, price analysis, trends, AI analysis */}
        <div className="space-y-6">
          {/* Comparable Sales Table */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Comparable Sales
              </h2>
              <span className="text-xs text-gray-500">
                {comps.length
                  ? `${comps.length} recent sales found via web search`
                  : "Run an analysis to load real comps"}
              </span>
            </div>
            {!comps.length ? (
              <p className="text-sm text-gray-500">
                Enter an address and click <strong>Analyze Property</strong> to
                pull recent comparable sales.
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-600">
                    <th className="px-3 py-2 font-semibold">Address</th>
                    <th className="px-3 py-2 font-semibold">Beds</th>
                    <th className="px-3 py-2 font-semibold">Baths</th>
                    <th className="px-3 py-2 font-semibold">Sqft</th>
                    <th className="px-3 py-2 font-semibold">Sold Price</th>
                    <th className="px-3 py-2 font-semibold">
                      Price per Sqft
                    </th>
                    <th className="px-3 py-2 font-semibold">Sold Date</th>
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
                          {comp.sqft.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          ${comp.soldPrice.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          ${ppsf.toFixed(0)}/sqft
                        </td>
                        <td className="px-3 py-2">
                          {new Date(
                            comp.soldDate
                          ).toLocaleDateString()}
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
            <h2 className="text-lg font-semibold text-gray-900">
              Price Analysis
            </h2>
            {priceStats ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <MetricCard
                    label="Average Sold Price"
                    value={`$${priceStats.avgPrice.toLocaleString(
                      undefined,
                      { maximumFractionDigits: 0 }
                    )}`}
                  />
                  <MetricCard
                    label="Median Sold Price"
                    value={`$${priceStats.medianPrice.toLocaleString(
                      undefined,
                      { maximumFractionDigits: 0 }
                    )}`}
                  />
                  <MetricCard
                    label="Average Price per Sqft"
                    value={`$${priceStats.avgPpsf.toFixed(0)}/sqft`}
                  />
                  <MetricCard
                    label="Estimated Market Value Range"
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
              <p className="text-sm text-gray-500">
                Price analysis will appear here once comparable sales are
                available.
              </p>
            )}
          </section>

          {/* Market Trends Section */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Market Trends
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <MetricCard
                label="Median Price (Area)"
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
                label="Average DOM"
                value={`${marketTrends.averageDom} days`}
              />
              <MetricCard
                label="Market Status"
                value={`${marketTrends.status} Market`}
              />
            </div>
          </section>

          {/* AI Market Analysis + Confidence */}
          <section className="bg-white shadow-md rounded-lg p-6 space-y-4 text-sm text-gray-700">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                AI Market Analysis
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Confidence
                </span>
                <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {confidenceScore.toFixed(0)} / 100
                </span>
              </div>
            </div>
            <p>{aiSummary}</p>
            {sources.length ? (
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Sources
                </p>
                <ul className="mt-2 space-y-1">
                  {sources.slice(0, 8).map((s, i) => (
                    <li key={i} className="truncate text-xs">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {disclaimer ? (
              <p className="border-t border-gray-100 pt-3 text-xs italic text-gray-500">
                {disclaimer}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {priceStats ? (
        <div className="mt-6">
          <SaveResultsButton
            tool="ai_cma_analyzer"
            inputs={inputs}
            results={priceStats as unknown as Record<string, unknown>}
            propertyAddress={inputs.address || null}
          />
        </div>
      ) : null}

      <div className="mt-8">
        <ToolLeadGate
          tool="ai_cma_analyzer"
          source="ai_cma_analyzer"
          intent="sell"
          propertyAddress={inputs.address || undefined}
          show={!!priceStats}
          title="Get Your Branded CMA Report"
          description="Unlock a downloadable PDF with your logo, expanded comparable-sales details, and a month-over-month market trend analysis."
          benefits={[
            "Branded PDF CMA report (agent logo + contact info)",
            "Expanded comparable sales with adjustments",
            "Month-over-month market trend chart",
            "Shareable client-ready link",
          ]}
        />
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

