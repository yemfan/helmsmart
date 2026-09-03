"use client";

import { useMemo, useState } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import ProgressiveLeadCaptureModal from "@/components/ProgressiveLeadCaptureModal";

type EstimateResponse = {
  ok: boolean;
  property: {
    address: string;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
  };
  estimate: {
    estimatedValue: number | null;
    low: number | null;
    high: number | null;
    summary: string;
  };
  compsCount?: number;
};

export default function HomeValueLandingPage() {
  const [address, setAddress] = useState("");
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<EstimateResponse["estimate"] | null>(null);

  const [beds, setBeds] = useState<number | null>(null);
  const [baths, setBaths] = useState<number | null>(null);
  const [sqft, setSqft] = useState<number | null>(null);
  const [trustText, setTrustText] = useState<string>("Based on recent nearby sales.");

  const [captureOpen, setCaptureOpen] = useState(false);
  const [unlockedReportLink, setUnlockedReportLink] = useState<string | null>(null);

  // Mortgage widget state
  const [mortgageLoading, setMortgageLoading] = useState(false);
  const [mortgageError, setMortgageError] = useState<string | null>(null);
  const [mortgageResult, setMortgageResult] = useState<number | null>(null);
  const [mortgageHomePrice, setMortgageHomePrice] = useState<number>(300000);

  const canEstimate = useMemo(() => address.trim().length > 3, [address]);

  const formatCurrency = (value: number | null) =>
    value == null || !Number.isFinite(value) ? "—" : `$${Math.round(value).toLocaleString()}`;

  const handleEstimate = async () => {
    setEstimateError(null);
    setUnlockedReportLink(null);
    setEstimate(null);

    if (!address.trim()) {
      setEstimateError("Please enter your address.");
      return;
    }

    setEstimateLoading(true);
    try {
      const res = await fetch("/api/property/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /*
         * No `refresh: true` — see the note in the home-value-estimator page.
         * Forcing a refresh bypassed the 180-day property cache on every
         * lookup, so a repeat visit re-paid the full ~35s AI property lookup.
         */
        body: JSON.stringify({ address: address.trim() }),
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? "Failed to estimate home value");
      }

      const data = json as EstimateResponse;
      setEstimate(data.estimate ?? null);
      setBeds(data.property?.beds ?? null);
      setBaths(data.property?.baths ?? null);
      setSqft(data.property?.sqft ?? null);
      setTrustText(data.estimate?.summary || "Based on recent nearby sales.");
    } catch (e: any) {
      setEstimateError(e?.message ?? "Unexpected error estimating home value.");
    } finally {
      setEstimateLoading(false);
    }
  };

  async function handleMortgageQuote() {
    setMortgageError(null);
    setMortgageResult(null);

    const addr = address.trim();
    if (!addr) {
      setMortgageError("Please enter a property address.");
      return;
    }

    const homePrice = Number(mortgageHomePrice);
    if (!Number.isFinite(homePrice) || homePrice <= 0) {
      setMortgageError("Please enter a valid home price.");
      return;
    }

    setMortgageLoading(true);
    try {
      const res = await fetch("/api/mortgage-rate/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, homePrice }),
        credentials: "include",
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? "Failed to get mortgage rate.");
      }

      const payment = Number(json?.monthlyPayment ?? json?.payment ?? json?.result ?? 0);
      setMortgageResult(Number.isFinite(payment) ? payment : null);
    } catch (e: any) {
      setMortgageError(e?.message ?? "Something went wrong.");
    } finally {
      setMortgageLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        <section className="text-center space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">
            Find Out What Your Home Is Worth
          </h1>
          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
            Get an instant estimate and receive a full CMA report by email (no spam).
          </p>
        </section>

        {/* Hero / Address */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-7">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-2">
                Your property address
              </label>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                placeholder="Enter your address"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleEstimate}
              disabled={!canEstimate || estimateLoading}
              className="w-full md:w-auto inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {estimateLoading ? "Estimating..." : "Get My Home Value"}
            </button>
          </div>

          {estimateError ? (
            <p className="mt-3 text-sm text-red-600 font-medium">{estimateError}</p>
          ) : null}
        </section>

        {/* Estimate Result */}
        {estimate ? (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Estimated Home Value
                    </div>
                    <div className="text-4xl font-extrabold text-blue-700 mt-1">
                      {formatCurrency(estimate.estimatedValue)}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      Range:{" "}
                      <span className="font-semibold">
                        {formatCurrency(estimate.low)}
                      </span>{" "}
                      –{" "}
                      <span className="font-semibold">
                        {formatCurrency(estimate.high)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Property Snapshot
                    </div>
                    <div className="text-sm text-slate-800 font-semibold mt-1">
                      {beds ?? "—"} Beds • {baths ?? "—"} Baths • {sqft ? Number(sqft).toLocaleString() : "—"} Sqft
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-sm text-slate-600">
                  {trustText}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                <div className="text-sm font-semibold text-slate-900 mb-2">
                  What this estimate is based on
                </div>
                <div className="text-sm text-slate-600">
                  Based on recent nearby comparable sold properties in the market.
                </div>
              </div>
            </div>

            {/* Lead Capture (Locked) */}
            <div className="space-y-4">
              {/* Mortgage Widget */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Get your mortgage rate</h2>
                  <p className="text-xs text-slate-600 mt-1">
                    Quick estimate of your monthly payment.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Estimated home price ($)
                  </label>
                  <input
                    type="number"
                    value={mortgageHomePrice}
                    onChange={(e) => setMortgageHomePrice(Number(e.target.value))}
                    min={0}
                    step={1000}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="300000"
                  />
                </div>

                <button
                  type="button"
                  disabled={!address.trim() || mortgageLoading}
                  onClick={handleMortgageQuote}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {mortgageLoading ? "Checking..." : "Get Mortgage Rate"}
                </button>

                {mortgageResult != null ? (
                  <p className="text-xs text-slate-700">
                    Estimated monthly payment:{" "}
                    <span className="font-semibold">
                      ${Math.round(mortgageResult).toLocaleString()}/mo
                    </span>
                  </p>
                ) : null}

                {mortgageError ? (
                  <p className="text-[11px] text-red-600 font-medium whitespace-pre-line">{mortgageError}</p>
                ) : null}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="text-sm font-semibold text-slate-900">
                  Want a more accurate value?
                </div>
                <div className="text-sm text-slate-600 mt-2">
                  Unlock your full CMA report in seconds (we&apos;ll ask for email first).
                </div>

                <div className="mt-5 space-y-3">
                  <button
                    onClick={() => setCaptureOpen(true)}
                    className="w-full inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Unlock Full Report
                  </button>

                  {unlockedReportLink ? (
                    <a
                      href={unlockedReportLink}
                      className="inline-flex w-full justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-800 border border-slate-200 hover:bg-slate-50"
                    >
                      View Your Report
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="bg-slate-900 text-slate-50 rounded-2xl p-5 text-xs space-y-2">
                <div className="text-sm font-semibold">Privacy-first</div>
                <div>
                  Your information is used only to deliver your report and follow up with selling guidance.
                  No raw MLS data is shared with you.
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
      <ProgressiveLeadCaptureModal
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        address={address}
        source="home_value"
        onUnlocked={({ reportLink }) => setUnlockedReportLink(reportLink)}
      />
    </div>
  );
}

