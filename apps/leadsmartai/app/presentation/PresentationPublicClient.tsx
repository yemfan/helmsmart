"use client";

import { useMemo } from "react";

/**
 * Public/shared presentation view. The `presentations.data` JSON has had
 * several shapes over time:
 *   - current: { property, estimate, comps, pricing_strategy, market_insights, marketing_plan }
 *   - legacy "seller_comparison": { properties:[{ address, beds, baths, sqft,
 *       estimatedValue, low, high, avgPricePerSqft, comps }], executive_summary,
 *       market_overview, recommendation }
 * We normalize any shape into one safe view model so old links don't crash
 * (the old code read data.property.address directly → "reading 'address'"
 * on legacy rows).
 */

type RawData = Record<string, any> | null | undefined;

type ViewModel = {
  address: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  estimatedValue: number | null;
  low: number | null;
  high: number | null;
  comps: Array<{ address: string; price: number | null; soldDate: string | null }>;
  pricing_strategy: string;
  market_insights: string;
  marketing_plan: string;
};

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normalize(data: RawData, fallbackAddress: string): ViewModel {
  const d = (data ?? {}) as Record<string, any>;
  // Current shape has `property`; legacy seller_comparison nests the subject
  // in `properties[0]`.
  const legacySubject = Array.isArray(d.properties) ? d.properties[0] : undefined;
  const p = (d.property ?? legacySubject ?? {}) as Record<string, any>;
  const est = (d.estimate ?? legacySubject ?? {}) as Record<string, any>;
  const rawComps = Array.isArray(d.comps)
    ? d.comps
    : Array.isArray(legacySubject?.comps)
      ? legacySubject.comps
      : [];

  const comps = rawComps
    .filter((c: any) => c && typeof c === "object")
    .map((c: any) => ({
      address: str(c.address) || "—",
      price: num(c.price ?? c.soldPrice ?? c.sold_price),
      soldDate: c.soldDate ?? c.sold_date ?? null,
    }));

  return {
    address: str(p.address) || fallbackAddress || "Listing Presentation",
    beds: num(p.beds),
    baths: num(p.baths),
    sqft: num(p.sqft),
    estimatedValue: num(est.estimatedValue ?? est.estimated_value),
    low: num(est.low),
    high: num(est.high),
    comps,
    // Narrative: current keys first, then the legacy equivalents.
    pricing_strategy: str(d.pricing_strategy || d.recommendation),
    market_insights: str(d.market_insights || d.market_overview || d.executive_summary),
    marketing_plan: str(d.marketing_plan || d.executive_summary),
  };
}

export default function PresentationPublicClient({
  presentationId,
  data,
  propertyAddress,
}: {
  presentationId: string;
  data: RawData;
  propertyAddress?: string;
}) {
  const vm = useMemo(
    () => normalize(data, propertyAddress ?? ""),
    [data, propertyAddress],
  );

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/presentation/${encodeURIComponent(
      presentationId
    )}`;
  }, [presentationId]);

  const formatCurrency = (value: number | null) =>
    value == null || !Number.isFinite(value)
      ? "—"
      : `$${Math.round(value).toLocaleString()}`;

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied!");
    } catch {
      window.prompt("Copy this link:", shareUrl);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF();

      let y = 10;
      doc.setFontSize(16);
      doc.text("Listing Presentation", 10, y);
      y += 8;

      doc.setFontSize(10);
      doc.text(`Address: ${vm.address}`, 12, y);
      y += 6;
      doc.text(
        `${vm.beds ?? "—"} beds • ${vm.baths ?? "—"} baths • ${
          vm.sqft ? vm.sqft.toLocaleString() : "—"
        } sqft`,
        12,
        y
      );
      y += 7;

      doc.setFontSize(12);
      doc.text("Estimated Value", 10, y);
      y += 6;
      doc.setFontSize(10);
      doc.text(`Point estimate: ${formatCurrency(vm.estimatedValue)}`, 12, y);
      y += 5;
      doc.text(
        `Range: ${formatCurrency(vm.low)} – ${formatCurrency(vm.high)}`,
        12,
        y
      );
      y += 8;

      const section = (title: string, body: string) => {
        doc.addPage();
        y = 10;
        doc.setFontSize(12);
        doc.text(title, 10, y);
        y += 6;
        doc.setFontSize(10);
        doc.splitTextToSize(body || "—", 190).forEach((ln: string) => {
          if (y > 280) {
            doc.addPage();
            y = 10;
          }
          doc.text(ln, 12, y);
          y += 5;
        });
      };
      section("Pricing Strategy", vm.pricing_strategy);
      section("Market Insights", vm.market_insights);
      section("Marketing Plan", vm.marketing_plan);

      doc.save("listing-presentation.pdf");
    } catch (err) {
      console.error(err);
      alert(
        "There was an issue generating the PDF. Make sure 'jspdf' is installed, then try again."
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Seller Listing Presentation
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {vm.address}
              </div>
              <div className="text-sm text-slate-600 mt-2">
                Estimated range:{" "}
                {formatCurrency(vm.low)} – {formatCurrency(vm.high)}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleDownloadPdf}
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 border border-slate-200 hover:bg-slate-50"
              >
                Download PDF
              </button>
              <button
                onClick={handleCopyShareLink}
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-800 border border-slate-200 hover:bg-slate-50"
              >
                Copy Link
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Point Estimate
              </div>
              <div className="text-3xl font-extrabold text-blue-700 mt-2">
                {formatCurrency(vm.estimatedValue)}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Beds/Baths
              </div>
              <div className="text-sm text-slate-800 font-semibold mt-2">
                {vm.beds ?? "—"} Beds • {vm.baths ?? "—"} Baths
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sqft
              </div>
              <div className="text-sm text-slate-800 font-semibold mt-2">
                {vm.sqft ? vm.sqft.toLocaleString() : "—"} Sqft
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Nearby Comparable Sales</div>
            <div className="text-xs text-slate-600 mt-1">
              Based on recent nearby sold comps.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-600">
                  <th className="px-3 py-2 font-semibold">Address</th>
                  <th className="px-3 py-2 font-semibold">Sold</th>
                  <th className="px-3 py-2 font-semibold">Sold Date</th>
                </tr>
              </thead>
              <tbody>
                {vm.comps.length ? (
                  vm.comps.slice(0, 8).map((c, idx) => (
                    <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap">{c.address}</td>
                      <td className="px-3 py-2">
                        {c.price == null ? "—" : `$${Math.round(c.price).toLocaleString()}`}
                      </td>
                      <td className="px-3 py-2">{c.soldDate || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-sm text-slate-600">
                      No comparable sold data available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-2">
            <div className="text-sm font-semibold text-slate-900">Pricing Strategy</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">
              {vm.pricing_strategy || "—"}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-2">
            <div className="text-sm font-semibold text-slate-900">Market Insights</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">
              {vm.market_insights || "—"}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-2">
            <div className="text-sm font-semibold text-slate-900">Marketing Plan</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">
              {vm.marketing_plan || "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
