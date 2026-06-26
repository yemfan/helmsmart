"use client";

import Link from "next/link";
import { useState } from "react";

type Comparable = {
  address: string;
  salePrice: number;
  sqft: number;
  pricePerSqft: number;
  distanceMiles: number;
  soldDate: string;
};

type PropertyDetails = {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  lotSize: number;
  yearBuilt: number;
  propertyType: string;
};

type ApiResponse = {
  property: PropertyDetails;
  comps: Comparable[];
  avgPricePerSqft: number | null;
  estimatedValue: number | null;
  low: number | null;
  high: number | null;
  summary: string;
  confidence?: string;
  confidenceScore?: number;
  recommendations?: string[];
};

export default function HomeValueEstimatorPage() {
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [reviewError, setReviewError] = useState<string | null>(null);

  const handleEstimate = async () => {
    if (!address.trim()) {
      setError("Please enter a property address.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);

    try {
      // Server-side hybrid engine + comps (warehouse / MLS CSV sold history).
      const res = await fetch("/api/property/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          refresh: true,
          includeComps: true,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? "Failed to estimate home value.");
      }

      const property = json?.property as any;
      const compsRaw = (json?.comps ?? []) as any[];

      const comps: Comparable[] = compsRaw.map((c) => ({
        address: String(c?.address ?? "—"),
        salePrice: Number(c?.salePrice ?? 0),
        sqft: Number(c?.sqft ?? 0),
        pricePerSqft: Number(c?.pricePerSqft ?? 0),
        distanceMiles: Number(c?.distanceMiles ?? 0),
        soldDate: String(c?.soldDate ?? "—"),
      }));

      const avgPricePerSqft =
        json?.medianPricePerSqft != null
          ? Number(json.medianPricePerSqft)
          : json?.avgPricePerSqft != null
            ? Number(json.avgPricePerSqft)
            : comps.length > 0
              ? comps.reduce((sum, c) => sum + c.pricePerSqft, 0) / comps.length
              : null;

      const est = json?.estimate ?? {};
      const estimatedValue =
        est.estimatedValue != null ? Number(est.estimatedValue) : null;
      const low = est.low != null ? Number(est.low) : null;
      const high = est.high != null ? Number(est.high) : null;
      const summary = String(
        est.summary ??
          "We couldn’t find enough comparable sold data yet. Import MLS CSV sold history first."
      );

      const subjectSqft = Number(property?.sqft ?? 0) || comps[0]?.sqft || 1500;

      const data: ApiResponse = {
        property: {
          address: String(property?.address ?? address.trim()),
          beds: Number(property?.beds ?? 0),
          baths: Number(property?.baths ?? 0),
          sqft: subjectSqft,
          lotSize: Number(property?.lotSize ?? property?.lot_size ?? 0),
          yearBuilt: Number(property?.yearBuilt ?? property?.year_built ?? 0),
          propertyType: String(property?.propertyType ?? property?.property_type ?? "—"),
        },
        comps,
        avgPricePerSqft,
        estimatedValue,
        low,
        high,
        summary,
        confidence: est.confidence,
        confidenceScore:
          est.confidenceScore != null ? Number(est.confidenceScore) : undefined,
        recommendations: Array.isArray(json?.recommendations)
          ? json.recommendations
          : undefined,
      };

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null) =>
    value == null ? "—" : `$${Math.round(value).toLocaleString()}`;

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-brand-text placeholder:text-brand-text/40 focus:outline-none focus:ring-2 focus:ring-brand-primary/30";

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-medium text-brand-text/70 hover:text-brand-primary"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Home
      </Link>

      <div>
        <h1 className="ui-page-title text-brand-text">Home Value Estimator</h1>
        <p className="ui-page-subtitle mt-1 max-w-2xl text-brand-text/80">
          Enter a property address to estimate its current market value based on recent comparable sales.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col items-stretch gap-3 md:flex-row">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, State"
            className={`flex-1 ${inputClass}`}
          />
          <button
            type="button"
            onClick={handleEstimate}
            disabled={loading}
            className="inline-flex min-w-[140px] items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : null}
            {loading ? "Estimating..." : "Estimate value"}
          </button>
        </div>
        {error ? <p className="mt-3 text-xs font-medium text-red-600">{error}</p> : null}
      </div>

      {result ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="ui-card-subtitle text-brand-text/60">Estimated home value</p>
              <p className="mt-1 text-2xl font-bold text-brand-primary">{formatCurrency(result.estimatedValue)}</p>
              {result.avgPricePerSqft ? (
                <p className="ui-meta mt-2 text-brand-text/55">
                  Avg. price/sqft: ${result.avgPricePerSqft.toFixed(0).toLocaleString()}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="ui-card-subtitle text-brand-text/60">Estimated range</p>
              <p className="ui-card-title mt-1 text-brand-text">
                {formatCurrency(result.low)} – {formatCurrency(result.high)}
              </p>
              <p className="ui-meta mt-2 text-brand-text/55">Range reflects model confidence — not a formal appraisal.</p>
              {result.confidence ? (
                <p className="ui-meta mt-2 text-brand-text/70">
                  Confidence:{" "}
                  <span className="font-semibold capitalize">{result.confidence}</span>
                  {result.confidenceScore != null ? ` (${result.confidenceScore}/100)` : null}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="ui-card-subtitle text-brand-text/60">Property snapshot</p>
              <p className="ui-card-title mt-1 text-brand-text">{result.property.address}</p>
              <p className="ui-meta mt-2 text-brand-text/70">
                {result.property.beds} beds • {result.property.baths} baths • {result.property.sqft.toLocaleString()}{" "}
                sqft
              </p>
              <p className="ui-meta text-brand-text/70">
                {result.property.propertyType} • Built {result.property.yearBuilt}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="ui-card-title text-brand-text">Comparable sales (last 6 months, ≤ 0.5 mi)</h2>
              <span className="ui-meta text-brand-text/55">{result.comps.length} comps used</span>
            </div>
            {result.comps.length === 0 ? (
              <p className="ui-table-cell text-brand-text/80">No comparable sales matched the current filters.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-brand-surface text-left">
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">Address</th>
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">Sale price</th>
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">Sqft</th>
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">Price/sqft</th>
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">Distance</th>
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">Sold date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.comps.map((c, idx) => (
                      <tr key={idx} className="border-t border-gray-100 hover:bg-brand-surface/60">
                        <td className="ui-table-cell whitespace-nowrap px-3 py-2 text-brand-text">{c.address}</td>
                        <td className="ui-table-cell px-3 py-2 text-brand-text">${c.salePrice.toLocaleString()}</td>
                        <td className="ui-table-cell px-3 py-2 text-brand-text">{c.sqft.toLocaleString()}</td>
                        <td className="ui-table-cell px-3 py-2 text-brand-text">${c.pricePerSqft.toFixed(0)}</td>
                        <td className="ui-table-cell px-3 py-2 text-brand-text">{c.distanceMiles.toFixed(2)} mi</td>
                        <td className="ui-table-cell px-3 py-2 text-brand-text">{c.soldDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {result.recommendations && result.recommendations.length > 0 ? (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-5 text-sm text-amber-950 shadow-sm">
              <h2 className="ui-card-title text-amber-950">Suggested next steps</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                {result.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-brand-primary/20 bg-brand-surface p-5 md:col-span-2 shadow-sm">
              <h2 className="ui-card-title text-brand-text">Estimate summary</h2>
              <p className="ui-table-cell mt-2 text-brand-text/90">{result.summary}</p>
              <p className="ui-meta mt-3 text-brand-text/65">
                This is an automated estimate for planning purposes only, not an appraisal.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm shadow-sm">
              <h2 className="ui-card-title text-brand-text">Get a personalized review</h2>
              {reviewStatus === "sent" ? (
                <p className="ui-meta mt-2 text-emerald-700">
                  Thanks! A local real estate professional will follow up with a detailed valuation.
                </p>
              ) : (
                <>
                  <p className="ui-meta mt-1 text-brand-text/70">
                    Share your contact info and a local real estate professional can provide a more detailed valuation.
                  </p>
                  <div className="mt-3 space-y-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      className={inputClass}
                    />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      className={inputClass}
                    />
                    {/* SMS opt-in — identical disclosure to /contact + /open-house-signup. */}
                    <label htmlFor="hv-sms-consent" className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-2">
                      <input
                        id="hv-sms-consent"
                        type="checkbox"
                        checked={smsConsent}
                        onChange={(e) => setSmsConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                      />
                      <span className="text-[11px] leading-relaxed text-gray-600">
                        <span className="font-semibold text-gray-900">Yes, send me marketing text messages from RealtyBoss.</span>{" "}
                        By checking this box and providing my phone number above, I consent to receive promotional text messages from RealtyBoss about real-estate services, new listings, market updates, and special offers.
                      </span>
                    </label>
                    <p className="text-[10px] leading-relaxed text-gray-400">
                      Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time, or HELP for help. Consent is not a condition of any purchase. See our{" "}
                      <Link href="/privacy" className="underline">Privacy Policy</Link> and{" "}
                      <Link href="/terms" className="underline">Terms of Service</Link> for details.
                    </p>
                    {reviewError ? (
                      <p className="text-[11px] font-medium text-rose-600">{reviewError}</p>
                    ) : null}
                    <button
                      type="button"
                      disabled={reviewStatus === "sending"}
                      onClick={async () => {
                        setReviewError(null);
                        const e = email.trim();
                        if (!e) {
                          setReviewError("Please enter your email.");
                          return;
                        }
                        if (smsConsent && !phone.trim()) {
                          setReviewError("Add a phone number to receive SMS, or untick the box.");
                          return;
                        }
                        setReviewStatus("sending");
                        try {
                          const res = await fetch("/api/leads", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              email: e,
                              phone: phone.trim(),
                              address: result?.property?.address || address,
                              source: "home-value-estimator",
                              smsConsent,
                            }),
                          });
                          const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                          if (!res.ok || j.ok === false) throw new Error(j.error || "Failed to submit.");
                          setReviewStatus("sent");
                        } catch (err) {
                          setReviewError(err instanceof Error ? err.message : "Failed to submit.");
                          setReviewStatus("error");
                        }
                      }}
                      className="w-full rounded-lg bg-brand-primary py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {reviewStatus === "sending" ? "Sending…" : "Request expert valuation"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

