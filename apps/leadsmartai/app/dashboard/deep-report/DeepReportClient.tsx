"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import DeepReportView from "@/components/deep-report/DeepReportView";
import { computeAffordability, computeInvestmentReturns } from "@/lib/deep-report/finance";
import type { DeepReport, PropertyUse } from "@/lib/deep-report/types";

const USE_OPTIONS: Array<{ value: PropertyUse; label: string }> = [
  { value: "primary", label: "Primary residence" },
  { value: "second_home", label: "Second home" },
  { value: "investment", label: "Investment / rental" },
];

type Quota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  reached: boolean;
  warning: boolean;
  unlimited: boolean;
  resetDate: string;
};

export default function DeepReportClient() {
  const [address, setAddress] = useState("");
  const [use, setUse] = useState<PropertyUse>("primary");
  const [showLoan, setShowLoan] = useState(false);
  const [downPct, setDownPct] = useState("20");
  const [ratePct, setRatePct] = useState("7");
  const [termYears, setTermYears] = useState("30");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DeepReport | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !reportId) return "";
    return `${window.location.origin}/deep-report/${encodeURIComponent(reportId)}`;
  }, [reportId]);

  // Loan terms are pure local math — recompute affordability (and investment
  // returns) live as the inputs change, so tweaking the loan never needs a new
  // report and is never blocked by the daily quota. The expensive web-search/AI
  // parts (value, comps, deal rating, schools…) stay exactly as generated.
  const displayReport = useMemo<DeepReport | null>(() => {
    if (!report) return null;
    if (!showLoan) return report;
    const d = Number(downPct);
    const r = Number(ratePct);
    const t = Number(termYears);
    if (!Number.isFinite(d) || !Number.isFinite(r) || !Number.isFinite(t)) return report;

    const affordability = computeAffordability(report.affordability.price, {
      ...report.affordability.assumptions,
      downPct: d,
      ratePct: r,
      termYears: t,
    });
    let investment = report.investment;
    if (report.propertyUse === "investment" && report.investment) {
      investment = {
        ...computeInvestmentReturns(report.affordability.price, report.investment.rentMonthly, affordability),
        rentSummary: report.investment.rentSummary,
      };
    }
    return { ...report, affordability, investment };
  }, [report, showLoan, downPct, ratePct, termYears]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/deep-report/quota", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; quota?: Quota };
        if (!cancelled && data.ok && data.quota) setQuota(data.quota);
      } catch {
        /* pill just won't render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onGenerate = useCallback(async () => {
    const addr = address.trim();
    if (!addr) return;
    setLoading(true);
    setError(null);
    try {
      const loanOverrides: Record<string, number> = {};
      if (showLoan) {
        const d = Number(downPct);
        const r = Number(ratePct);
        const t = Number(termYears);
        if (Number.isFinite(d)) loanOverrides.downPct = d;
        if (Number.isFinite(r)) loanOverrides.ratePct = r;
        if (Number.isFinite(t)) loanOverrides.termYears = t;
      }
      const res = await fetch("/api/dashboard/deep-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr, propertyUse: use, loanOverrides }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        report?: DeepReport;
        id?: string;
        quota?: Quota;
        error?: string;
      };
      if (data.quota) setQuota(data.quota);
      if (!res.ok || data.ok === false || !data.report) throw new Error(data.error ?? `HTTP ${res.status}`);
      setReport(data.report);
      setReportId(data.id ?? null);
      // Seed the loan fields from the generated assumptions so opening "Loan
      // assumptions" shows the real values and the live recompute matches.
      const used = data.report.affordability.assumptions;
      setDownPct(String(used.downPct));
      setRatePct(String(used.ratePct));
      setTermYears(String(used.termYears));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }, [address, use, showLoan, downPct, ratePct, termYears]);

  return (
    <div className="space-y-6">
      {/* Form */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <label className="block flex-1">
            <span className="text-sm font-semibold text-slate-900">Property address</span>
            <div className="mt-1">
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                placeholder="123 Main St, Austin, TX 78701"
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                disabled={loading || quota?.reached === true}
              />
            </div>
          </label>
          {quota ? <QuotaPill quota={quota} /> : null}
        </div>

        <div className="mt-3">
          <span className="text-sm font-semibold text-slate-900">How will the buyer use it?</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {USE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setUse(o.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
                  use === o.value
                    ? "bg-emerald-700 text-white ring-emerald-700"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowLoan((v) => !v)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            {showLoan ? "− Loan assumptions" : "+ Loan assumptions (optional)"}
          </button>
          {showLoan ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="block text-xs">
                <span className="text-slate-600">Down %</span>
                <input value={downPct} onChange={(e) => setDownPct(e.target.value)} inputMode="decimal" className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              </label>
              <label className="block text-xs">
                <span className="text-slate-600">Rate %</span>
                <input value={ratePct} onChange={(e) => setRatePct(e.target.value)} inputMode="decimal" className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              </label>
              <label className="block text-xs">
                <span className="text-slate-600">Term (yrs)</span>
                <input value={termYears} onChange={(e) => setTermYears(e.target.value)} inputMode="numeric" className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              </label>
            </div>
          ) : null}
          {showLoan && report ? (
            <p className="mt-2 text-xs text-slate-400">
              Affordability updates instantly below — no new report needed.
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {quota?.reached ? "Daily limit reached — resets at midnight UTC." : "Searches the live web — results take up to a minute."}
          </span>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading || address.trim().length === 0 || quota?.reached === true}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Generating…" : "Generate Deep Report"}
          </button>
        </div>
        {quota?.reached ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>
              You&rsquo;ve used all {quota.limit} Deep Report{quota.limit === 1 ? "" : "s"} for today. Resets at midnight UTC.
            </span>
            <Link href="/agent/pricing" className="shrink-0 font-semibold text-amber-900 underline hover:text-amber-950">
              Upgrade for more →
            </Link>
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Crunching value, comps, affordability, deal rating, schools, and the map…
        </div>
      ) : null}

      {displayReport && !loading ? (
        <DeepReportView report={displayReport} shareUrl={shareUrl || null} />
      ) : null}
    </div>
  );
}

function QuotaPill({ quota }: { quota: Quota }) {
  const tone = quota.reached
    ? "bg-rose-50 text-rose-700 ring-rose-200"
    : quota.warning
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${tone}`}
      title={`Daily Deep Report quota — resets ${quota.resetDate}`}
    >
      {quota.unlimited ? "Unlimited reports" : `${quota.remaining} of ${quota.limit} left today`}
    </span>
  );
}
