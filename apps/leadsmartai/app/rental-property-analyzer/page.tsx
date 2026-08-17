"use client";

import JsonLd from "../../components/JsonLd";
import Link from "next/link";
import ResultCard from "../../components/ResultCard";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import RequireAuthGate from "../../components/RequireAuthGate";

type PropertyData = {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number | null;
  lotSize: number | null;
  type: string;
  value: number;
  rent: number;
  tax: number;
  insurance: number;
  hoa: number;
  utilities: number;
  downPayment: number;
  interestRate: number;
  loanTerm: number;
};

type Metrics = {
  monthlyCashFlow: number;
  annualCashFlow: number;
  capRate: number;
  cashOnCash: number;
  priceToRent: number;
  roi: number;
};

type DealScore = {
  score: number;
  label: string;
  color: "green" | "yellow" | "red";
};

const MOCK_PROPERTY: PropertyData = {
  address: "123 Main St, Los Angeles, CA 90001",
  beds: 3,
  baths: 2,
  sqft: 1800,
  yearBuilt: 1995,
  lotSize: 6000,
  type: "Single Family",
  value: 825000,
  rent: 3200,
  tax: 7200,
  insurance: 1200,
  hoa: 0,
  utilities: 200,
  downPayment: 165000,
  interestRate: 6,
  loanTerm: 30,
};

const MOCK_NEARBY_RENTALS = [
  {
    address: "118 Main St",
    beds: 3,
    baths: 2,
    sqft: 1750,
    rent: 3100,
    distance: "0.1 mi",
  },
  {
    address: "140 Oak Ave",
    beds: 3,
    baths: 2.5,
    sqft: 1950,
    rent: 3450,
    distance: "0.3 mi",
  },
  {
    address: "212 Pine Dr",
    beds: 4,
    baths: 3,
    sqft: 2200,
    rent: 3800,
    distance: "0.4 mi",
  },
  {
    address: "87 Elm St",
    beds: 2,
    baths: 1,
    sqft: 1300,
    rent: 2600,
    distance: "0.2 mi",
  },
  {
    address: "332 Oakridge Ct",
    beds: 3,
    baths: 2,
    sqft: 1850,
    rent: 3250,
    distance: "0.5 mi",
  },
];

export default function RentalPropertyAnalyzerPage() {
  return (
    <RequireAuthGate>
      <RentalPropertyAnalyzerPageInner />
    </RequireAuthGate>
  );
}

function RentalPropertyAnalyzerPageInner() {
  const { t } = useTranslation("dashboard");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [propertyData, setPropertyData] =
    useState<PropertyData>(MOCK_PROPERTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLookup, setLastLookup] = useState<
    | null
    | {
        endpoint: string;
        ok: boolean;
        status: number;
        received: any;
      }
  >(null);

  const numericKeys: (keyof PropertyData)[] = [
    "beds",
    "baths",
    "sqft",
    "yearBuilt",
    "lotSize",
    "value",
    "rent",
    "tax",
    "insurance",
    "hoa",
    "utilities",
    "downPayment",
    "interestRate",
    "loanTerm",
  ];

  const handleAnalyze = async () => {
    if (!address.trim()) {
      alert("Please enter a property address.");
      return;
    }
    setLoading(true);
    setError(null);
    setLastLookup(null);
    try {
      const trimmed = address.trim();
      const fullAddress =
        zip.trim() && !trimmed.toLowerCase().includes(zip.trim().toLowerCase())
          ? `${trimmed}, ${zip.trim()}`
          : trimmed;

      const isUrl = /^https?:\/\//i.test(trimmed);

      const endpoint = isUrl
        ? `/api/property/from-listing?refresh=true&url=${encodeURIComponent(
            trimmed
          )}`
        : `/api/property?refresh=true&address=${encodeURIComponent(fullAddress)}`;

      const res = await fetch(endpoint, { method: "GET" });

      const json = (await res.json()) as any;
      setLastLookup({
        endpoint,
        ok: Boolean(json?.ok),
        status: res.status,
        received: json,
      });
      if (!res.ok) {
        throw new Error(json?.error ?? "Address lookup failed");
      }

      // Normalize response shapes:
      // - /api/property => { ok, data }
      // - /api/property/from-listing => { ok, address, data }
      const data = (json?.data ?? json) as any;

      const fetchedAddress: string =
        (typeof json?.address === "string" && json.address.trim()) ||
        (typeof data?.address === "string" && data.address.trim()) ||
        fullAddress;

      const price =
        Number(data?.price ?? data?.estimated_value ?? data?.value ?? NaN);
      const beds = Number(data?.beds ?? NaN);
      const baths = Number(data?.baths ?? NaN);
      const sqft = Number(data?.sqft ?? NaN);
      const yearBuilt = Number(data?.year_built ?? data?.yearBuilt ?? NaN);
      const lotSize = Number(data?.lot_size ?? data?.lotSize ?? NaN);
      const propertyType =
        (typeof data?.property_type === "string" && data.property_type) ||
        (typeof data?.type === "string" && data.type) ||
        undefined;
      const rent = Number(data?.rent ?? data?.rent_estimate ?? NaN);

      setPropertyData((prev) => {
        const nextValue = Number.isFinite(price) && price > 0 ? price : prev.value;
        const nextRent = Number.isFinite(rent) && rent > 0 ? rent : prev.rent;
        const nextDownPayment =
          nextValue > 0 ? Math.round(nextValue * 0.2) : prev.downPayment;

        return {
          ...prev,
          address: fetchedAddress,
          type: propertyType ?? prev.type,
          value: nextValue,
          rent: nextRent,
          beds: Number.isFinite(beds) && beds > 0 ? beds : prev.beds,
          baths: Number.isFinite(baths) && baths > 0 ? baths : prev.baths,
          sqft: Number.isFinite(sqft) && sqft > 0 ? sqft : prev.sqft,
          yearBuilt: Number.isFinite(yearBuilt) && yearBuilt > 0 ? yearBuilt : prev.yearBuilt,
          lotSize: Number.isFinite(lotSize) && lotSize > 0 ? lotSize : prev.lotSize,
          downPayment: nextDownPayment,
        };
      });
    } catch (e: any) {
      console.error("Rental analyzer lookup failed", e);
      setError(e?.message ?? "Address lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleFindOnZillow = () => {
    const trimmed = address.trim();
    const z = zip.trim();
    const query = [trimmed, z].filter(Boolean).join(" ");
    if (!query) {
      alert("Please enter an address (and optional ZIP) first.");
      return;
    }

    const target = `https://www.zillow.com/homes/${encodeURIComponent(query)}_rb/`;
    window.open(target, "_blank", "noopener,noreferrer");
  };

  const metrics: Metrics = useMemo(() => {
    const {
      value,
      downPayment,
      interestRate,
      loanTerm,
      rent,
      tax,
      insurance,
      hoa,
      utilities,
    } = propertyData;

    const loanAmount = Math.max(value - downPayment, 0);
    const monthlyRate = interestRate > 0 ? interestRate / 100 / 12 : 0;
    const n = loanTerm * 12;

    const mortgage =
      loanAmount > 0 && monthlyRate > 0
        ? (loanAmount *
            monthlyRate *
            Math.pow(1 + monthlyRate, n)) /
          (Math.pow(1 + monthlyRate, n) - 1)
        : loanAmount > 0 && n > 0
        ? loanAmount / n
        : 0;

    const monthlyTaxes = tax / 12;
    const monthlyInsurance = insurance / 12;
    const monthlyExpenses =
      monthlyTaxes + monthlyInsurance + hoa + utilities;

    const monthlyCashFlow = rent - mortgage - monthlyExpenses;
    const annualCashFlow = monthlyCashFlow * 12;

    const annualIncome = rent * 12;
    const annualOperatingExpenses =
      tax + insurance + hoa * 12 + utilities * 12;
    const annualNOI = annualIncome - annualOperatingExpenses;
    const capRate = value > 0 ? (annualNOI / value) * 100 : 0;

    const cashOnCash =
      downPayment > 0 ? (annualCashFlow / downPayment) * 100 : 0;

    const priceToRent = rent > 0 ? value / (rent * 12) : 0;

    const appreciation = value * 0.02;
    const roi =
      downPayment > 0
        ? ((annualCashFlow + appreciation) / downPayment) * 100
        : 0;

    return {
      monthlyCashFlow,
      annualCashFlow,
      capRate,
      cashOnCash,
      priceToRent,
      roi,
    };
  }, [propertyData]);

  const dealScore: DealScore = useMemo(() => {
    const { monthlyCashFlow, capRate, cashOnCash, priceToRent } = metrics;
    let score = 50;

    if (monthlyCashFlow > 0) score += 15;
    else if (monthlyCashFlow < 0) score -= 15;

    if (capRate > 0) {
      const capBonus = Math.max(0, Math.min((capRate - 4) * 3, 20));
      score += capBonus;
    }

    if (cashOnCash > 0) {
      const cocBonus = Math.max(0, Math.min(cashOnCash, 20));
      score += cocBonus;
    }

    if (priceToRent > 0) {
      if (priceToRent <= 15) score += 10;
      else if (priceToRent >= 25) score -= 10;
    }

    score = Math.max(0, Math.min(100, score));

    let label: DealScore["label"] = "Moderate Investment";
    let color: DealScore["color"] = "yellow";
    if (score >= 80) {
      label = "Good Investment";
      color = "green";
    } else if (score <= 60) {
      label = "Poor Investment";
      color = "red";
    }

    return { score, label, color };
  }, [metrics]);

  const aiSummary = useMemo(() => {
    const { monthlyCashFlow, capRate, cashOnCash, roi, priceToRent } =
      metrics;
    const parts: string[] = [];

    const locationLabel =
      propertyData.address ||
      address ||
      (zip ? `the area around ZIP ${zip}` : "the entered address");

    parts.push(
      `This property at ${locationLabel} is estimated to generate roughly $${monthlyCashFlow.toFixed(
        0
      )} in monthly cash flow after mortgage and operating expenses.`
    );

    if (capRate > 0) {
      parts.push(
        `The projected cap rate is approximately ${capRate.toFixed(
          1
        )}%, which you can benchmark against other rentals in this neighborhood to assess income performance.`
      );
    }

    if (cashOnCash > 0) {
      parts.push(
        `Cash-on-cash return is about ${cashOnCash.toFixed(
          1
        )}%, reflecting how efficiently your down payment is working in year one.`
      );
    }

    parts.push(
      `A simple first-year ROI estimate of ${roi.toFixed(
        1
      )}% (including a small appreciation assumption) suggests how this deal might compare to alternative investments.`
    );

    if (priceToRent > 0) {
      parts.push(
        `The price-to-rent ratio of ${priceToRent.toFixed(
          1
        )} can be compared to nearby cities and submarkets; lower ratios usually favor stronger cash flow, while higher ratios lean more on long-term appreciation.`
      );
    }

    parts.push(
      "As always, confirm local rental demand, property condition, and regulatory considerations (such as rent control or STR rules) before committing capital."
    );

    return parts.join(" ");
  }, [metrics, propertyData.address, address, zip]);

  const handleDownloadReport = async () => {
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF();

      let y = 10;
      doc.setFontSize(14);
      doc.text("Rental Property Analysis Report", 10, y);
      y += 8;

      doc.setFontSize(10);
      doc.text(`Address: ${propertyData.address}`, 10, y);
      y += 6;

      doc.text("Property Details", 10, y);
      y += 5;
      const detailLines = [
        `Type: ${propertyData.type}`,
        `Beds/Baths: ${propertyData.beds} / ${propertyData.baths}`,
        `Sqft: ${propertyData.sqft.toLocaleString()}`,
        `Year Built: ${propertyData.yearBuilt ?? "N/A"}`,
        `Lot Size: ${
          propertyData.lotSize
            ? propertyData.lotSize.toLocaleString()
            : "N/A"
        } sqft`,
        `Value: $${propertyData.value.toLocaleString()}`,
        `Rent: $${propertyData.rent.toLocaleString()} / mo`,
        `Tax: $${propertyData.tax.toLocaleString()} / yr`,
        `Insurance: $${propertyData.insurance.toLocaleString()} / yr`,
        `HOA: $${propertyData.hoa.toLocaleString()} / mo`,
        `Utilities: $${propertyData.utilities.toLocaleString()} / mo`,
      ];
      detailLines.forEach((line) => {
        doc.text(line, 12, y);
        y += 5;
      });

      y += 3;
      doc.text("Investment Metrics", 10, y);
      y += 5;
      const metricLines = [
        `Monthly Cash Flow: $${metrics.monthlyCashFlow.toFixed(0)}`,
        `Annual Cash Flow: $${metrics.annualCashFlow.toFixed(0)}`,
        `Cap Rate: ${metrics.capRate.toFixed(2)}%`,
        `Cash on Cash Return: ${metrics.cashOnCash.toFixed(2)}%`,
        `Price to Rent Ratio: ${
          metrics.priceToRent > 0
            ? metrics.priceToRent.toFixed(1)
            : "N/A"
        }`,
        `ROI (Year 1 est.): ${metrics.roi.toFixed(2)}%`,
        `Deal Score: ${dealScore.score.toFixed(0)} / 100 (${dealScore.label})`,
      ];
      metricLines.forEach((line) => {
        doc.text(line, 12, y);
        y += 5;
      });

      y += 3;
      doc.text("AI Market Summary", 10, y);
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

      doc.save("rental-property-analysis.pdf");
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert(
        "There was an issue generating the PDF. Make sure 'jspdf' is installed, then try again."
      );
    }
  };

  const resultCardDetails = [
    `Annual cash flow: $${metrics.annualCashFlow.toFixed(0)}`,
    `Cap rate: ${metrics.capRate.toFixed(1)}%`,
    `Cash on cash: ${metrics.cashOnCash.toFixed(1)}%`,
    `ROI (year 1 est.): ${metrics.roi.toFixed(1)}%`,
    `Deal score: ${dealScore.score.toFixed(0)} (${dealScore.label})`,
  ].join("\n");

  return (
    <div className="w-full max-w-6xl py-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Rental Property Analyzer",
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript",
          url: "https://closebossai.com/rental-property-analyzer",
          description:
            "Analyze rental property cash flow, cap rate, cash-on-cash return, and ROI from an address.",
        }}
      />
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-blue-600 text-sm font-medium mb-6"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>{t("pages.articleChrome.backHome")}</Link>

      <h1 className="text-3xl font-bold text-blue-600 mb-2">{t("pages.rentalAnalyzer.h1")}</h1>
      <p className="text-gray-600 mb-8">{t("pages.rentalAnalyzer.sub")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white shadow-md rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t("pages.rentalAnalyzer.propertyAddress")}</h2>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("pages.rentalAnalyzer.addressPlaceholder")}
                className="border border-gray-300 px-3 py-2 rounded w-full sm:w-72 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder={t("pages.rentalAnalyzer.zipOptional")}
                className="border border-gray-300 px-3 py-2 rounded w-full sm:w-32 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleFindOnZillow}
                disabled={loading}
                title={t("pages.rentalAnalyzer.openZillow")}
              >{t("pages.rentalAnalyzer.findOnZillow")}</button>
              <button
                type="button"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleAnalyze}
                disabled={loading}
              >
                {loading ? "Analyzing..." : "Analyze Property"}
              </button>
            </div>
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            {lastLookup ? (
              <details className="text-left">
                <summary className="text-xs text-gray-500 cursor-pointer select-none">{t("pages.rentalAnalyzer.showLookup")}</summary>
                <pre className="mt-2 overflow-x-auto rounded border border-gray-200 bg-gray-50 p-3 text-[11px] leading-snug text-gray-700">
                  {JSON.stringify(
                    {
                      endpoint: lastLookup.endpoint,
                      status: lastLookup.status,
                      ok: lastLookup.ok,
                      received: lastLookup.received,
                    },
                    null,
                    2
                  )}
                </pre>
              </details>
            ) : null}
            <p className="text-xs text-gray-500">{t("pages.rentalAnalyzer.autofillNote")}</p>
          </div>

          <DealScoreCard dealScore={dealScore} />

          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">{t("pages.rentalAnalyzer.detailsAndAssumptions")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {(
            Object.entries(propertyData) as [keyof PropertyData, any][]
          ).map(([key, value]) => {
            const label = key
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (m) => m.toUpperCase());
            const isNumberField = numericKeys.includes(key);
            const inputType = isNumberField ? "number" : "text";
            const tooltip =
              key === "value"
                ? "Market value or purchase price used in cap rate and ROI."
                : key === "rent"
                ? "Estimated monthly rent for the property."
                : key === "tax"
                ? "Annual property taxes."
                : key === "insurance"
                ? "Annual property insurance cost."
                : key === "hoa"
                ? "Monthly HOA dues, if applicable."
                : key === "utilities"
                ? "Monthly utilities paid by the landlord."
                : key === "downPayment"
                ? "Cash invested as a down payment."
                : key === "interestRate"
                ? "Annual interest rate for the loan."
                : key === "loanTerm"
                ? "Length of the loan in years."
                : undefined;

            return (
              <label key={key} className="block text-xs">
                <span
                  className="text-gray-600 font-semibold"
                  title={tooltip}
                >
                  {label}
                </span>
                <input
                  type={inputType}
                  value={value ?? ""}
                  onChange={(e) =>
                    setPropertyData((prev) => ({
                      ...prev,
                      [key]: isNumberField
                        ? Number(e.target.value) || 0
                        : e.target.value,
                    }))
                  }
                  className="mt-1 w-full border border-gray-300 px-2 py-1.5 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            );
          })}
        </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <ResultCard
              title={t("pages.rentalAnalyzer.monthlyCashFlow")}
              value={`$${metrics.monthlyCashFlow.toFixed(0)}/mo`}
              details={resultCardDetails}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label={t("pages.articleChrome.monthlyCashFlow")}
          value={`$${metrics.monthlyCashFlow.toFixed(0)}`}
          tooltip="Monthly Cash Flow = Rent – Mortgage – Operating Expenses"
          highlight={
            metrics.monthlyCashFlow > 0
              ? "positive"
              : metrics.monthlyCashFlow < 0
              ? "negative"
              : "neutral"
          }
        />
        <MetricCard
          label={t("pages.rentalAnalyzer.annualCashFlow")}
          value={`$${metrics.annualCashFlow.toFixed(0)}`}
          tooltip="Annual Cash Flow = Monthly Cash Flow × 12"
          highlight={
            metrics.annualCashFlow > 0
              ? "positive"
              : metrics.annualCashFlow < 0
              ? "negative"
              : "neutral"
          }
        />
        <MetricCard
          label={t("pages.articleChrome.capRate")}
          value={`${metrics.capRate.toFixed(1)}%`}
          tooltip="Cap Rate = (Annual NOI ÷ Property Value) × 100"
        />
        <MetricCard
          label={t("pages.rentalAnalyzer.cashOnCash")}
          value={`${metrics.cashOnCash.toFixed(1)}%`}
          tooltip="Cash on Cash = (Annual Cash Flow ÷ Down Payment) × 100"
        />
        <MetricCard
          label={t("pages.rentalAnalyzer.priceToRent")}
          value={
            metrics.priceToRent > 0
              ? metrics.priceToRent.toFixed(1)
              : "N/A"
          }
          tooltip="Price to Rent Ratio = Property Value ÷ (Annual Rent)"
        />
        <MetricCard
          label={t("pages.rentalAnalyzer.roiYear1")}
          value={`${metrics.roi.toFixed(1)}%`}
          tooltip="ROI ≈ (Annual Cash Flow + Appreciation) ÷ Down Payment"
        />
      </div>

      <div className="bg-yellow-50 border border-yellow-100 p-6 rounded-lg mb-6 text-sm text-gray-800">
        <h2 className="text-xl font-semibold mb-2 text-gray-900">{t("pages.rentalAnalyzer.aiSummary")}</h2>
        <p>{aiSummary}</p>
      </div>

      <div className="bg-white shadow-md rounded-lg p-6 mb-6 text-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold text-gray-900">{t("pages.rentalAnalyzer.nearbyComps")}</h2>
          <span className="text-xs text-gray-500">{t("pages.rentalAnalyzer.sampleData")}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.address")}</th>
                <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.beds")}</th>
                <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.baths")}</th>
                <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.sqft")}</th>
                <th className="px-3 py-2 font-semibold">{t("pages.rentalAnalyzer.rent")}</th>
                <th className="px-3 py-2 font-semibold">{t("pages.rentalAnalyzer.rentPerSqft")}</th>
                <th className="px-3 py-2 font-semibold">{t("pages.rentalAnalyzer.distance")}</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_NEARBY_RENTALS.map((r, idx) => {
                const rentPerSqft = r.rent / Math.max(r.sqft, 1);
                return (
                  <tr
                    key={idx}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.address}
                    </td>
                    <td className="px-3 py-2">{r.beds}</td>
                    <td className="px-3 py-2">{r.baths}</td>
                    <td className="px-3 py-2">
                      {r.sqft.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      ${r.rent.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      ${rentPerSqft.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">{r.distance}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <section className="mt-12 max-w-3xl space-y-3 text-sm text-gray-700">
        <h2 className="text-xl font-semibold text-gray-900">{t("pages.rentalAnalyzer.oneAddressTitle")}</h2>
        <p>{t("pages.rentalAnalyzer.oneAddressBody")}</p>
        <p>{t("pages.rentalAnalyzer.disclaimer")}</p>
      </section>

      <div className="mt-10">
        <button
          type="button"
          className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm sm:text-base font-semibold hover:bg-blue-700"
          onClick={handleDownloadReport}
        >{t("pages.rentalAnalyzer.downloadReport")}</button>
      </div>
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
  highlight?: "positive" | "negative" | "neutral";
  tooltip?: string;
};

function MetricCard({
  label,
  value,
  highlight,
  tooltip,
}: MetricCardProps) {
  const color =
    highlight === "positive"
      ? "text-emerald-700"
      : highlight === "negative"
      ? "text-rose-700"
      : "text-gray-900";

  return (
    <div
      className="bg-gray-50 border border-gray-100 p-4 rounded text-center"
      title={tooltip}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </h3>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

type DealScoreCardProps = {
  dealScore: DealScore;
};

function DealScoreCard({ dealScore }: DealScoreCardProps) {
  const { t } = useTranslation("dashboard");
  const colorClasses =
    dealScore.color === "green"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : dealScore.color === "red"
      ? "bg-rose-50 border-rose-200 text-rose-800"
      : "bg-amber-50 border-amber-200 text-amber-800";

  const tooltip =
    "Deal score is based on monthly cash flow, cap rate, cash-on-cash return, and price-to-rent ratio. It is a heuristic guide, not investment advice.";

  return (
    <div
      className={`border rounded-xl p-4 sm:p-5 shadow-sm ${colorClasses} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3`}
      title={tooltip}
    >
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide">{t("pages.rentalAnalyzer.dealScore")}</h2>
        <p className="text-xs opacity-80">{t("pages.rentalAnalyzer.dealScoreNote")}</p>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-3xl sm:text-4xl font-bold">
          {dealScore.score.toFixed(0)}
        </span>
        <span className="text-sm font-medium opacity-80">/ 100</span>
        <span className="ml-2 inline-flex items-center rounded-full border border-current px-3 py-1 text-xs font-semibold">
          {dealScore.label}
        </span>
      </div>
    </div>
  );
}

