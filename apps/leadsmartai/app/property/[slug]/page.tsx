"use client";

import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";

type Comparable = {
  address: string;
  salePrice: number;
  sqft: number;
  pricePerSqft: number;
  distanceMiles: number;
};

type PropertySnapshot = {
  address: string;
  city: string;
  state: string;
  beds: number;
  baths: number;
  sqft: number;
  lotSize: number;
  yearBuilt: number;
  propertyType: string;
  /** When set, show hero thumbnail; otherwise no photo box */
  photoUrl?: string | null;
};

type InvestmentMetrics = {
  capRate: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  roi: number;
};

export default function PropertyReportPage() {
  const { t } = useTranslation("dashboard");
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const decodedAddress = useMemo(() => {
    try {
      return decodeURIComponent(slug).replace(/-/g, " ");
    } catch {
      return slug.replace(/-/g, " ");
    }
  }, [slug]);

  const [saving, setSaving] = useState(false);

  const property = useMemo((): PropertySnapshot => {
    return {
      address: decodedAddress || "123 Main St",
      city: "Los Angeles",
      state: "CA",
      beds: 3,
      baths: 2,
      sqft: 1850,
      lotSize: 5500,
      yearBuilt: 1994,
      propertyType: "Single Family",
    };
  }, [decodedAddress]);

  const comparables: Comparable[] = [
    {
      address: "123 Oak St",
      salePrice: 785000,
      sqft: 1700,
      pricePerSqft: 0,
      distanceMiles: 0.2,
    },
    {
      address: "45 Pine Ave",
      salePrice: 810000,
      sqft: 1950,
      pricePerSqft: 0,
      distanceMiles: 0.3,
    },
    {
      address: "890 Maple Dr",
      salePrice: 830000,
      sqft: 1900,
      pricePerSqft: 0,
      distanceMiles: 0.4,
    },
  ].map((c) => ({
    ...c,
    pricePerSqft: c.salePrice / c.sqft,
  }));

  const {
    estimatedValue,
    low,
    high,
    avgPricePerSqft,
    rentEstimate,
    investmentMetrics,
    mortgagePayment,
    aiSummary,
  } = useMemo(() => {
    const avgPricePerSqft =
      comparables.reduce((sum, c) => sum + c.pricePerSqft, 0) /
      comparables.length;
    const estimatedValue = avgPricePerSqft * property.sqft;
    const low = estimatedValue * 0.92;
    const high = estimatedValue * 1.08;

    const rentEstimate = 3200;

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
    const insurance = 1200;
    const hoa = 0;
    const utilities = 200;
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

    const invMetrics: InvestmentMetrics = {
      capRate,
      monthlyCashFlow,
      annualCashFlow,
      roi,
    };

    const aiSummary = [
      `Based on recent comparable sales within 0.5 miles in the past 6 months, the estimated value of this property is approximately $${Math.round(
        estimatedValue
      ).toLocaleString()}, with a likely range between $${Math.round(
        low
      ).toLocaleString()} and $${Math.round(high).toLocaleString()}.`,
      `At an estimated monthly rent of $${rentEstimate.toLocaleString()}, the projected cap rate is about ${capRate.toFixed(
        1
      )}% and monthly cash flow is roughly $${monthlyCashFlow.toFixed(
        0
      )} after typical mortgage and operating expenses.`,
      `Assuming a 20% down payment and a 30‑year fixed loan at 6%, the first‑year ROI (including a modest appreciation assumption) is approximately ${roi.toFixed(
        1
      )}%.`,
      "As always, verify local demand, property condition, and regulations before relying on this report for investment decisions.",
    ].join(" ");

    return {
      estimatedValue,
      low,
      high,
      avgPricePerSqft,
      rentEstimate,
      investmentMetrics: invMetrics,
      mortgagePayment,
      aiSummary,
    };
  }, [comparables, property]);

  const handleDownloadPdf = async () => {
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF();

      let y = 10;
      doc.setFontSize(14);
      doc.text("Property Report", 10, y);
      y += 7;

      doc.setFontSize(10);
      doc.text("Property Header", 10, y);
      y += 5;
      doc.text(
        `${property.address}, ${property.city}, ${property.state}`,
        12,
        y
      );
      y += 5;
      doc.text(
        `${property.beds} beds • ${property.baths} baths • ${property.sqft.toLocaleString()} sqft • ${property.propertyType}`,
        12,
        y
      );
      y += 8;

      doc.text("Home Value", 10, y);
      y += 5;
      doc.text(
        `Estimated Value: $${Math.round(estimatedValue).toLocaleString()}`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Range: $${Math.round(low).toLocaleString()} – $${Math.round(
          high
        ).toLocaleString()}`,
        12,
        y
      );
      y += 8;

      doc.text("Rental & Investment Analysis", 10, y);
      y += 5;
      doc.text(
        `Estimated Rent: $${rentEstimate.toLocaleString()} / mo`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Cap Rate: ${investmentMetrics.capRate.toFixed(2)}%`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Monthly Cash Flow: $${investmentMetrics.monthlyCashFlow.toFixed(
          0
        )}`,
        12,
        y
      );
      y += 5;
      doc.text(
        `Annual Cash Flow: $${investmentMetrics.annualCashFlow.toFixed(0)}`,
        12,
        y
      );
      y += 5;
      doc.text(`ROI (Year 1 est.): ${investmentMetrics.roi.toFixed(2)}%`, 12, y);
      y += 8;

      doc.text("Mortgage Estimate", 10, y);
      y += 5;
      doc.text(
        `Estimated Monthly Payment: $${mortgagePayment.toFixed(0)}`,
        12,
        y
      );
      y += 8;

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

      doc.save("property-report.pdf");
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert(
        "There was an issue generating the PDF. Make sure 'jspdf' is installed, then try again."
      );
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Property Report",
          text: `Property report for ${property.address}`,
          url,
        });
      } catch {
        // user cancelled
      }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        alert("Link copied to clipboard.");
      } catch {
        alert("Unable to copy link. You can copy it from the address bar.");
      }
    } else {
      alert("Sharing is not supported in this browser.");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/property-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          property,
          comparables,
          estimatedValue,
          low,
          high,
          rentEstimate,
          investmentMetrics,
          mortgagePayment,
          aiSummary,
        }),
      });
      alert("Report saved (placeholder). Connect a real database next.");
    } catch (err) {
      console.error(err);
      alert("There was an issue saving the report.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row items-start gap-4">
        <div className="flex-1 bg-white shadow rounded-xl p-5 border border-gray-100">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{t("pages.propertyReport.h1")}</h1>
          <p className="text-sm text-gray-700 font-medium">
            {property.address}
          </p>
          <p className="text-xs text-gray-500">
            {property.city}, {property.state}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {property.beds} beds • {property.baths} baths •{" "}
            {property.sqft.toLocaleString()} sqft • {property.propertyType}
          </p>
        </div>
        {property.photoUrl ? (
          <div className="h-32 w-full shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 md:w-48">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={property.photoUrl}
              alt={t("pages.property.photoAlt", { address: property.address })}
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleDownloadPdf}
          className="inline-flex items-center bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700"
        >{t("pages.propertyReport.downloadPdf")}</button>
        <button
          onClick={handleShare}
          className="inline-flex items-center bg-white text-gray-800 text-sm font-semibold px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >{t("pages.propertyReport.shareReport")}</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? t("common:status.saving") : t("pages.property.saveToDatabase")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white shadow rounded-lg p-4 border border-gray-100">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("pages.propertyReport.estimatedValue")}</h2>
          <p className="text-2xl font-bold text-blue-700">
            ${Math.round(estimatedValue).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Range: ${Math.round(low).toLocaleString()} – $
            {Math.round(high).toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Avg price/sqft: ${avgPricePerSqft.toFixed(0)}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-4 border border-gray-100">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("pages.propertyReport.rentalEstimate")}</h2>
          <p className="text-xl font-semibold text-gray-900">
            ${rentEstimate.toLocaleString()} / mo
          </p>
          <p className="text-xs text-gray-500 mt-1">{t("pages.propertyReport.rentalNote")}</p>
        </div>
        <div className="bg-white shadow rounded-lg p-4 border border-gray-100">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t("pages.propertyReport.mortgageEstimate")}</h2>
          <p className="text-xl font-semibold text-gray-900">
            ${mortgagePayment.toFixed(0)} / mo
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Assumes 20% down, 30‑year fixed at 6%.
          </p>
        </div>
      </div>

      <div className="bg-white shadow rounded-xl p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("pages.articleChrome.comparableSales", { ns: "dashboard" })}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.address", { ns: "dashboard" })}</th>
                <th className="px-3 py-2 font-semibold">{t("pages.propertyReport.salePrice")}</th>
                <th className="px-3 py-2 font-semibold">{t("pages.articleChrome.sqft", { ns: "dashboard" })}</th>
                <th className="px-3 py-2 font-semibold">{t("pages.propertyReport.pricePerSqft")}</th>
                <th className="px-3 py-2 font-semibold">{t("pages.propertyReport.distance")}</th>
              </tr>
            </thead>
            <tbody>
              {comparables.map((c, idx) => (
                <tr
                  key={idx}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    {c.address}
                  </td>
                  <td className="px-3 py-2">
                    ${c.salePrice.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{c.sqft.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    ${c.pricePerSqft.toFixed(0)}
                  </td>
                  <td className="px-3 py-2">
                    {c.distanceMiles.toFixed(2)} mi
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white shadow rounded-xl p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("pages.propertyReport.investmentAnalysis")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t("pages.articleChrome.capRate", { ns: "dashboard" })}</p>
            <p className="text-lg font-semibold text-gray-900">
              {investmentMetrics.capRate.toFixed(1)}%
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t("pages.articleChrome.monthlyCashFlow", { ns: "dashboard" })}</p>
            <p className="text-lg font-semibold text-gray-900">
              ${investmentMetrics.monthlyCashFlow.toFixed(0)}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t("pages.propertyReport.roiYear1")}</p>
            <p className="text-lg font-semibold text-gray-900">
              {investmentMetrics.roi.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-sm text-blue-900">
        <h2 className="text-sm font-semibold mb-2">{t("pages.propertyReport.aiSummary")}</h2>
        <p>{aiSummary}</p>
      </div>
    </div>
  );
}

