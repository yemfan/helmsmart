"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Hard ceiling on a single estimate request. The server path is bounded by the
 * Vercel function timeout (300s), which is far longer than any consumer will
 * wait — aborting at 90s lets us say something honest instead of leaving the
 * spinner up until the platform kills the request.
 */
const ESTIMATE_TIMEOUT_MS = 90_000;

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
  /*
   * Null means "the source had nothing", and it has to survive all the way to
   * the render. These were `number` and every absent value arrived as 0, so a
   * property the API knew nothing about was described as having 0 beds, 0
   * baths and being built in the year 0.
   */
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSize: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
};

/** A finite number, or null — never the 0 that `Number(undefined ?? 0)` gives. */
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const DASH = "—";

/** What the reader sees for a fact we do not have. */
function show(v: number | null): string {
  return v == null ? DASH : v.toLocaleString();
}

/** Sources return addresses lowercased; a street address is a proper noun. */
function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

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
  const { t } = useTranslation("web_home_value_estimator");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [reviewError, setReviewError] = useState<string | null>(null);

  /*
   * Say how long this is taking, because a cold lookup takes a while.
   *
   * An address we've never seen goes out to the AI property lookup, which was
   * measured at 35s and has been seen to run past two minutes. A spinner that
   * sits there saying nothing for that long is indistinguishable from a broken
   * page — a field tester waited 138 seconds and concluded the page was dead,
   * which is the correct conclusion to draw from no feedback at all. Same
   * treatment the Zillow/Redfin analyzer already got.
   */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [loading]);

  const handleEstimate = async () => {
    if (!address.trim()) {
      setError(t("error_no_address"));
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ESTIMATE_TIMEOUT_MS);

    try {
      // Server-side hybrid engine + comps (warehouse / MLS CSV sold history).
      const res = await fetch("/api/property/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          address: address.trim(),
          /*
           * Deliberately NOT `refresh: true`. Forcing a refresh skipped the
           * 180-day `properties_cache` on every single lookup, so the same
           * address paid the full AI property lookup (measured 35s cold) every
           * time instead of the ~1s a cache hit costs. A home value does not
           * move enough in 180 days to be worth two minutes of a frozen tab.
           */
          includeComps: true,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? t("error_failed"));
      }

      const property = json?.property as any;
      const compsRaw = (json?.comps ?? []) as any[];

      const comps: Comparable[] = compsRaw.map((c) => ({
        address: titleCase(String(c?.address ?? "—")),
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
      const summary = String(est.summary ?? t("summary_fallback"));

      /*
       * Fall back to a comp's footage when the subject's is unknown, but never
       * to a made-up number. This used to end in `|| 1500`, so every address the
       * API had no record of was reported at 1,500 sqft — directly above a
       * summary saying we had no square footage on file for it.
       */
      const subjectSqft = num(property?.sqft) ?? comps[0]?.sqft ?? null;

      const data: ApiResponse = {
        property: {
          address: titleCase(String(property?.address ?? address.trim())),
          beds: num(property?.beds),
          baths: num(property?.baths),
          sqft: subjectSqft,
          lotSize: num(property?.lotSize ?? property?.lot_size),
          yearBuilt: num(property?.yearBuilt ?? property?.year_built),
          propertyType:
            property?.propertyType ?? property?.property_type
              ? String(property.propertyType ?? property.property_type)
              : null,
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
      setError(
        err?.name === "AbortError"
          ? t("error_timeout")
          : err.message || t("error_unexpected"),
      );
    } finally {
      clearTimeout(timeout);
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
        {t("back_home")}
      </Link>

      <div>
        <h1 className="ui-page-title text-brand-text">{t("title")}</h1>
        <p className="ui-page-subtitle mt-1 max-w-2xl text-brand-text/80">
          {t("subtitle")}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col items-stretch gap-3 md:flex-row">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("address_placeholder")}
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
            {loading ? t("estimating") : t("estimate_button")}
          </button>
        </div>
        {loading ? (
          <p className="mt-3 text-xs text-brand-text/60" aria-live="polite">
            {elapsed < 6
              ? t("estimating_progress")
              : t("estimating_progress_slow", { seconds: elapsed })}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-xs font-medium text-red-600">{error}</p> : null}
      </div>

      {result && result.estimatedValue == null && result.comps.length === 0 ? (
        /*
         * Nothing came back to value the address with. Saying that plainly beats
         * an estimate card reading $0 – $0 beside a confident-looking summary.
         */
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="ui-card-title text-amber-900">{t("result.no_value_heading")}</p>
          <p className="ui-meta mt-1 text-amber-900/80">{t("result.no_value_body")}</p>
        </div>
      ) : result ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="ui-card-subtitle text-brand-text/60">{t("result.estimated_value")}</p>
              <p className="mt-1 text-2xl font-bold text-brand-primary">{formatCurrency(result.estimatedValue)}</p>
              {result.avgPricePerSqft ? (
                <p className="ui-meta mt-2 text-brand-text/55">
                  {t("result.avg_price_per_sqft", { value: result.avgPricePerSqft.toFixed(0).toLocaleString() })}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="ui-card-subtitle text-brand-text/60">{t("result.estimated_range")}</p>
              <p className="ui-card-title mt-1 text-brand-text">
                {formatCurrency(result.low)} – {formatCurrency(result.high)}
              </p>
              <p className="ui-meta mt-2 text-brand-text/55">{t("result.range_note")}</p>
              {result.confidence ? (
                <p className="ui-meta mt-2 text-brand-text/70">
                  {t("result.confidence_label")}{" "}
                  <span className="font-semibold capitalize">{result.confidence}</span>
                  {result.confidenceScore != null ? ` (${result.confidenceScore}/100)` : null}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="ui-card-subtitle text-brand-text/60">{t("result.property_snapshot")}</p>
              <p className="ui-card-title mt-1 text-brand-text">{result.property.address}</p>
              <p className="ui-meta mt-2 text-brand-text/70">
                {t("result.beds_baths_sqft", {
                  beds: show(result.property.beds),
                  baths: show(result.property.baths),
                  sqft: show(result.property.sqft),
                })}
              </p>
              <p className="ui-meta text-brand-text/70">
                {t("result.type_built", {
                  type: result.property.propertyType ?? DASH,
                  year: show(result.property.yearBuilt),
                })}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="ui-card-title text-brand-text">{t("result.comps_heading")}</h2>
              <span className="ui-meta text-brand-text/55">{t("result.comps_used", { count: result.comps.length })}</span>
            </div>
            {result.comps.length === 0 ? (
              <p className="ui-table-cell text-brand-text/80">{t("result.no_comps")}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-brand-surface text-left">
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">{t("result.col_address")}</th>
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">{t("result.col_sale_price")}</th>
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">{t("result.col_sqft")}</th>
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">{t("result.col_price_sqft")}</th>
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">{t("result.col_distance")}</th>
                      <th className="ui-table-header px-3 py-2 text-brand-text/80">{t("result.col_sold_date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.comps.map((c, idx) => (
                      <tr key={idx} className="border-t border-gray-100 hover:bg-brand-surface/60">
                        <td className="ui-table-cell whitespace-nowrap px-3 py-2 text-brand-text">{c.address}</td>
                        <td className="ui-table-cell px-3 py-2 text-brand-text">${c.salePrice.toLocaleString()}</td>
                        <td className="ui-table-cell px-3 py-2 text-brand-text">{c.sqft.toLocaleString()}</td>
                        <td className="ui-table-cell px-3 py-2 text-brand-text">${c.pricePerSqft.toFixed(0)}</td>
                        <td className="ui-table-cell px-3 py-2 text-brand-text">{c.distanceMiles.toFixed(2)} {t("result.distance_unit")}</td>
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
              <h2 className="ui-card-title text-amber-950">{t("result.next_steps")}</h2>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                {result.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-brand-primary/20 bg-brand-surface p-5 md:col-span-2 shadow-sm">
              <h2 className="ui-card-title text-brand-text">{t("result.estimate_summary")}</h2>
              <p className="ui-table-cell mt-2 text-brand-text/90">{result.summary}</p>
              <p className="ui-meta mt-3 text-brand-text/65">
                {t("result.estimate_disclaimer")}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm shadow-sm">
              <h2 className="ui-card-title text-brand-text">{t("review.heading")}</h2>
              {reviewStatus === "sent" ? (
                <p className="ui-meta mt-2 text-emerald-700">
                  {t("review.sent")}
                </p>
              ) : (
                <>
                  <p className="ui-meta mt-1 text-brand-text/70">
                    {t("review.prompt")}
                  </p>
                  <div className="mt-3 space-y-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("review.email_placeholder")}
                      className={inputClass}
                    />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t("review.phone_placeholder")}
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
                        <span className="font-semibold text-gray-900">{t("review.sms_consent_bold")}</span>{" "}
                        {t("review.sms_consent_body")}
                      </span>
                    </label>
                    <p className="text-[10px] leading-relaxed text-gray-400">
                      {t("review.disclosure_pre")}{" "}
                      <Link href="/privacy" className="underline">{t("review.privacy")}</Link> {t("review.and")}{" "}
                      <Link href="/terms" className="underline">{t("review.terms")}</Link> {t("review.disclosure_post")}
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
                          setReviewError(t("review.error_email"));
                          return;
                        }
                        if (smsConsent && !phone.trim()) {
                          setReviewError(t("review.error_phone"));
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
                          if (!res.ok || j.ok === false) throw new Error(j.error || t("review.error_submit"));
                          setReviewStatus("sent");
                        } catch (err) {
                          setReviewError(err instanceof Error ? err.message : t("review.error_submit"));
                          setReviewStatus("error");
                        }
                      }}
                      className="w-full rounded-lg bg-brand-primary py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {reviewStatus === "sending" ? t("review.sending") : t("review.submit")}
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

