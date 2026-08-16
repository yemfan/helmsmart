 "use client";

import { useMemo, useState } from "react";
import { getServerT } from "@/lib/i18n/server";

type Platform = "zillow" | "redfin";

type PropertySummary = {
  platform: Platform;
  id: string | null;
  url: string;
  price: number;
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  lotSize: number | null;
  yearBuilt: number | null;
  propertyType: string;
  imageUrl?: string | null;
};

function pickListingImageUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  for (const k of [
    "image_url",
    "photo_url",
    "hero_image_url",
    "main_photo_url",
    "thumbnail_url",
    "imageUrl",
    "photoUrl",
  ]) {
    const v = d[k];
    if (typeof v === "string" && v.trim().startsWith("http")) return v.trim();
  }
  return null;
}

type Metrics = {
  estimatedValue: number;
  rentEstimate: number;
  capRate: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  roi: number;
};

type DealScore = {
  score: number;
  color: "green" | "yellow" | "red";
};

export default async function AIZillowRedfinLinkAnalyzerPage() {
  const t = await getServerT();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const metrics: Metrics | null = useMemo(() => {
    if (!property) return null;

    const estimatedValue = property.price;
    const rentEstimate =
      property.platform === "zillow"
        ? Math.round(property.price * 0.004)
        : Math.round(property.price * 0.0038);

    const value = estimatedValue;
    const downPayment = value * 0.2;
    const loanAmount = value - downPayment;
    const rate = 0.06;
    const termYears = 30;
    const n = termYears * 12;
    const monthlyRate = rate / 12;
    const mortgagePayment =
      loanAmount > 0
        ? (loanAmount *
            monthlyRate *
            Math.pow(1 + monthlyRate, n)) /
          (Math.pow(1 + monthlyRate, n) - 1)
        : 0;

    const tax = value * 0.012;
    const insurance = 1500;
    const hoa = 0;
    const utilities = 250;
    const monthlyExpenses = tax / 12 + insurance / 12 + hoa + utilities;

    const monthlyCashFlow = rentEstimate - mortgagePayment - monthlyExpenses;
    const annualCashFlow = monthlyCashFlow * 12;

    const income = rentEstimate * 12;
    const operating = tax + insurance + hoa * 12 + utilities * 12;
    const noi = income - operating;
    const capRate = value > 0 ? (noi / value) * 100 : 0;

    const appreciation = value * 0.02;
    const roi =
      downPayment > 0
        ? ((annualCashFlow + appreciation) / downPayment) * 100
        : 0;

    return {
      estimatedValue,
      rentEstimate,
      capRate,
      monthlyCashFlow,
      annualCashFlow,
      roi,
    };
  }, [property]);

  const dealScore: DealScore | null = useMemo(() => {
    if (!metrics) return null;

    let score = 50;

    if (metrics.monthlyCashFlow > 0) score += 20;
    else if (metrics.monthlyCashFlow < 0) score -= 20;

    if (metrics.capRate > 6) score += 15;
    else if (metrics.capRate < 4) score -= 10;

    if (metrics.roi > 10) score += 15;

    score = Math.max(0, Math.min(100, score));

    let color: DealScore["color"] = "yellow";
    if (score > 80) color = "green";
    else if (score < 60) color = "red";

    return { score, color };
  }, [metrics]);

  const aiSummary = useMemo(() => {
    if (!property || !metrics || !dealScore) return "";

    const platformLabel =
      property.platform === "zillow" ? "Zillow" : "Redfin";

    const lines = [];
    lines.push(
      `This ${platformLabel} listing at ${property.address} is priced at $${property.price.toLocaleString()} and offers approximately ${property.beds} beds, ${property.baths} baths, and ${property.sqft.toLocaleString()} sqft of living space.`
    );
    lines.push(
      `Using an estimated value aligned with the asking price and a rent estimate of $${metrics.rentEstimate.toLocaleString()} per month, the projected cap rate is around ${metrics.capRate.toFixed(
        1
      )}% with monthly cash flow of roughly $${metrics.monthlyCashFlow.toFixed(
        0
      )} after typical mortgage and operating expenses.`
    );
    lines.push(
      `Assuming 20% down and a 30‑year fixed loan at 6%, first‑year ROI (including modest appreciation) is estimated around ${metrics.roi.toFixed(
        1
      )}%.`
    );
    lines.push(
      `Overall, this deal scores ${dealScore.score.toFixed(
        0
      )} out of 100, which you can benchmark against other properties in your pipeline. Always verify local rents, property condition, and regulations before relying on this estimate.`
    );

    return lines.join(" ");
  }, [property, metrics, dealScore]);

  const detectPlatform = (inputUrl: string): Platform | null => {
    if (/zillow\.com/i.test(inputUrl)) return "zillow";
    if (/redfin\.com/i.test(inputUrl)) return "redfin";
    return null;
  };

  const extractId = (
    inputUrl: string,
    platform: Platform
  ): string | null => {
    if (platform === "zillow") {
      const match = inputUrl.match(/\/(\d+)_zpid/i);
      return match ? match[1] : null;
    }
    if (platform === "redfin") {
      const match = inputUrl.match(/\/home\/(\d+)/i);
      return match ? match[1] : null;
    }
    return null;
  };

  const handleAnalyze = async () => {
    setError(null);
    setProperty(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please paste a Zillow or Redfin listing URL.");
      return;
    }

    const platform = detectPlatform(trimmed);
    if (!platform) {
      setError("Unsupported URL. Only zillow.com and redfin.com are supported.");
      return;
    }

    const id = extractId(trimmed, platform);
    if (!id) {
      setError(
        platform === "zillow"
          ? "Could not extract a zpid from this Zillow URL."
          : "Could not extract a home ID from this Redfin URL."
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/property/from-listing?url=${encodeURIComponent(trimmed)}`
      );
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body.error || "Failed to analyze listing.");

      const data = body.data ?? {};
      // Helpful debug for mismatches (open DevTools console)
      console.log("from-listing response", body);
      const realProperty: PropertySummary = {
        platform,
        id,
        url: trimmed,
        price: Number(data.price ?? data.estimated_value ?? 0),
        address: String(data.address ?? body.address ?? ""),
        beds: Number(data.beds ?? 0),
        baths: Number(data.baths ?? 0),
        sqft: Number(data.sqft ?? 0),
        lotSize: data.lot_size ?? null,
        yearBuilt: data.year_built ?? null,
        propertyType: String(data.property_type ?? "Unknown"),
        imageUrl: pickListingImageUrl(data),
      };

      if (!realProperty.address) {
        throw new Error("Could not resolve an address from this listing URL.");
      }

      setProperty(realProperty);
    } catch (e: any) {
      console.error(e);
      setError(
        e?.message ??
          "There was an issue analyzing this link. Try Refresh Latest Data or a different URL."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!url.trim()) return;
    setRefreshing(true);
    setError(null);
    try {
      const trimmed = url.trim();
      const res = await fetch(
        `/api/property/from-listing?refresh=true&url=${encodeURIComponent(
          trimmed
        )}`
      );
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body.error || "Failed to refresh listing.");

      const platform = detectPlatform(trimmed);
      if (!platform) throw new Error("Unsupported URL.");
      const id = extractId(trimmed, platform);

      const data = body.data ?? {};
      console.log("from-listing refresh response", body);
      const refreshed: PropertySummary = {
        platform,
        id,
        url: trimmed,
        price: Number(data.price ?? data.estimated_value ?? 0),
        address: String(data.address ?? body.address ?? ""),
        beds: Number(data.beds ?? 0),
        baths: Number(data.baths ?? 0),
        sqft: Number(data.sqft ?? 0),
        lotSize: data.lot_size ?? null,
        yearBuilt: data.year_built ?? null,
        propertyType: String(data.property_type ?? "Unknown"),
        imageUrl: pickListingImageUrl(data),
      };

      setProperty(refreshed);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh data.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!property || !metrics) return;
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF();

      let y = 10;
      doc.setFontSize(14);
      doc.text("AI Zillow / Redfin Link Analysis", 10, y);
      y += 7;

      doc.setFontSize(10);
      doc.text("Property Summary", 10, y);
      y += 5;
      doc.text(`Address: ${property.address}`, 12, y);
      y += 5;
      doc.text(
        `Price: $${property.price.toLocaleString()} • ${property.beds} beds / ${property.baths} baths • ${property.sqft.toLocaleString()} sqft`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Type: ${property.propertyType} • Year Built: ${property.yearBuilt ?? "N/A"}`,
        12,
        y
      );
      y += 8;

      doc.text("Investment Metrics", 10, y);
      y += 5;
      doc.text(
        `Estimated Value: $${metrics.estimatedValue.toLocaleString()}`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Rent Estimate: $${metrics.rentEstimate.toLocaleString()} / mo`,
        12,
        y
      );
      y += 5;
      doc.text(`Cap Rate: ${metrics.capRate.toFixed(2)}%`, 12, y);
      y += 5;
      doc.text(
        `Monthly Cash Flow: $${metrics.monthlyCashFlow.toFixed(0)}`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Annual Cash Flow: $${metrics.annualCashFlow.toFixed(0)}`,
        12,
        y
      );
      y += 5;
      doc.text(`ROI (Year 1 est.): ${metrics.roi.toFixed(2)}%`, 12, y);
      y += 8;

      if (dealScore) {
        doc.text("Deal Score", 10, y);
        y += 5;
        doc.text(
          `Overall Deal Score: ${dealScore.score.toFixed(0)} / 100`,
          12,
          y
        );
        y += 8;
      }

      if (aiSummary) {
        doc.text("AI Summary", 10, y);
        y += 5;
        const summaryLines = doc.splitTextToSize(aiSummary, 190);
        summaryLines.forEach((line: string) => {
          if (y > 280) {
            doc.addPage();
            y = 10;
          }
          doc.text(line, 12, y);
          y += 5;
        });
      }

      doc.save("ai-zillow-redfin-link-analysis.pdf");
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert(
        "There was an issue generating the PDF. Make sure 'jspdf' is installed, then try again."
      );
    }
  };

  const scoreColor = dealScore
    ? dealScore.color === "green"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : dealScore.color === "yellow"
      ? "bg-amber-50 border-amber-200 text-amber-800"
      : "bg-rose-50 border-rose-200 text-rose-800"
    : "bg-gray-50 border-gray-200 text-gray-700";

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="bg-white shadow rounded-xl p-6 border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("pages.linkAnalyzer.h1")}</h1>
        <p className="text-sm text-gray-600 mb-4">
          Paste a Zillow or Redfin listing URL to generate an AI‑style
          investment snapshot including value, rent, cash flow, cap rate, ROI,
          and a deal score.
        </p>
        <div className="flex flex-col md:flex-row gap-3 items-stretch">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("pages.linkAnalyzer.urlPlaceholder")}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="inline-flex items-center justify-center bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed min-w-[150px]"
          >
            {loading && (
              <span className="mr-2 inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? "Analyzing..." : "Analyze Listing"}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex items-center justify-center bg-white text-blue-700 text-sm font-semibold px-4 py-2 rounded-lg border border-blue-200 hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed min-w-[180px]"
          >
            {refreshing ? "Refreshing..." : "Refresh Latest Data"}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-600 font-medium">{error}</p>
        )}
      </div>

      {property && metrics && (
        <div className="space-y-6">
          <div className="bg-white shadow rounded-xl p-6 border border-gray-100 flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                {property.address}
              </h2>
              <p className="text-sm text-gray-700 mb-1">
                ${property.price.toLocaleString()} • {property.beds} beds •{" "}
                {property.baths} baths • {property.sqft.toLocaleString()} sqft
              </p>
              <p className="text-xs text-gray-500">
                {property.propertyType}
                {property.yearBuilt && ` • Built ${property.yearBuilt}`}
              </p>
              <a
                href={property.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-xs text-blue-600 hover:underline"
              >{t("pages.linkAnalyzer.viewListing")}{property.platform === "zillow" ? "Zillow" : "Redfin"})
              </a>
            </div>
            {property.imageUrl ? (
              <div className="h-24 w-full shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 md:w-40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={property.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white shadow rounded-lg p-4 border border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("pages.linkAnalyzer.estimatedValue")}</h3>
              <p className="text-2xl font-bold text-blue-700">
                ${metrics.estimatedValue.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">{t("pages.linkAnalyzer.valueNote")}</p>
            </div>
            <div className="bg-white shadow rounded-lg p-4 border border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("pages.linkAnalyzer.rentEstimate")}</h3>
              <p className="text-xl font-semibold text-gray-900">
                ${metrics.rentEstimate.toLocaleString()} / mo
              </p>
              <p className="text-xs text-gray-500 mt-1">{t("pages.linkAnalyzer.rentNote")}</p>
            </div>
            <div
              className={`shadow rounded-lg p-4 border ${scoreColor} flex flex-col justify-between`}
            >
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-1">{t("pages.linkAnalyzer.dealScore")}</h3>
                <p className="text-xs opacity-80">{t("pages.linkAnalyzer.dealScoreNote")}</p>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-bold">
                  {dealScore ? dealScore.score.toFixed(0) : "--"}
                </span>
                <span className="text-xs font-medium opacity-80">/ 100</span>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-xl p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("pages.linkAnalyzer.investmentMetrics")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
              <MetricCard
                label={t("pages.articleChrome.capRate", { ns: "dashboard" })}
                value={`${metrics.capRate.toFixed(1)}%`}
                tooltip="Cap Rate = (NOI ÷ Value) × 100"
              />
              <MetricCard
                label={t("pages.articleChrome.monthlyCashFlow", { ns: "dashboard" })}
                value={`$${metrics.monthlyCashFlow.toFixed(0)}`}
                tooltip="Monthly Cash Flow = Rent – Mortgage – Operating Expenses"
              />
              <MetricCard
                label={t("pages.linkAnalyzer.annualCashFlow")}
                value={`$${metrics.annualCashFlow.toFixed(0)}`}
                tooltip="Annual Cash Flow = Monthly Cash Flow × 12"
              />
              <MetricCard
                label={t("pages.linkAnalyzer.roiYear1")}
                value={`${metrics.roi.toFixed(1)}%`}
                tooltip="Approximate ROI including cash flow plus simple appreciation."
              />
            </div>
          </div>

          {aiSummary && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-sm text-blue-900">
              <h2 className="text-sm font-semibold mb-2">{t("pages.linkAnalyzer.aiSummary")}</h2>
              <p>{aiSummary}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700"
            >{t("pages.linkAnalyzer.downloadPdf")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  tooltip?: string;
};

function MetricCard({ label, value, tooltip }: MetricCardProps) {
  return (
    <div
      className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center"
      title={tooltip}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

