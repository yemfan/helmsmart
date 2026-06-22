"use client";

import { useCallback, useRef, useState } from "react";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import { downloadComparisonReportPdf } from "@/components/comparison-report/downloadComparisonPdf";
import type { DeepReport, PropertyUse } from "@/lib/deep-report/types";

const USE_OPTIONS: Array<{ value: PropertyUse; label: string }> = [
  { value: "primary", label: "Primary residence" },
  { value: "second_home", label: "Second home" },
  { value: "investment", label: "Investment / rental" },
];

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${Math.round(n).toLocaleString()}`;
const pct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(1)}%`;

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
  const reportRef = useRef<HTMLDivElement>(null);

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
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; report?: DeepReport; error?: string };
      if (!res.ok || data.ok === false || !data.report) throw new Error(data.error ?? `HTTP ${res.status}`);
      setReport(data.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }, [address, use, showLoan, downPct, ratePct, termYears]);

  const onDownloadPdf = useCallback(async () => {
    if (reportRef.current) {
      await downloadComparisonReportPdf(reportRef.current, "property-deep-report.pdf");
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Form */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="text-sm font-semibold text-slate-900">Property address</span>
          <div className="mt-1">
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              placeholder="123 Main St, Austin, TX 78701"
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              disabled={loading}
            />
          </div>
        </label>

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
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">Searches the live web — results take up to a minute.</span>
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading || address.trim().length === 0}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Generating…" : "Generate Deep Report"}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </section>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Crunching value, comps, affordability, deal rating, schools, and the map…
        </div>
      ) : null}

      {report && !loading ? (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDownloadPdf}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              ↓ Download PDF
            </button>
          </div>
          <div ref={reportRef} className="space-y-5 bg-slate-50 p-1">
            <ReportBody report={report} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {title ? <h2 className="mb-2 text-sm font-semibold text-slate-900">{title}</h2> : null}
      {children}
    </section>
  );
}

function gradeTone(grade: string): string {
  const g = grade.charAt(0).toUpperCase();
  if (g === "A") return "bg-emerald-600";
  if (g === "B") return "bg-emerald-500";
  if (g === "C") return "bg-amber-500";
  if (g === "D") return "bg-orange-500";
  if (g === "F") return "bg-rose-600";
  return "bg-slate-400";
}

function ReportBody({ report: r }: { report: DeepReport }) {
  const p = r.property;
  const a = r.affordability;
  const inv = r.investment;

  const detail = (label: string, value: string) => (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Agent header */}
      {r.agent && (r.agent.name || r.agent.brokerage) ? (
        <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {r.agent.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.agent.photoUrl} alt="" crossOrigin="anonymous" className="h-12 w-12 rounded-full object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900">{r.agent.name ?? "Your Agent"}</div>
            <div className="text-xs text-slate-600">
              {[r.agent.brokerage, r.agent.licenseNumber ? `Lic #${r.agent.licenseNumber}` : null].filter(Boolean).join(" · ")}
            </div>
            <div className="text-xs text-slate-500">{[r.agent.phone, r.agent.email].filter(Boolean).join(" · ")}</div>
          </div>
        </section>
      ) : null}

      {/* Hero: address + deal rating */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Property Deep Report</div>
        <div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <div className="text-2xl font-bold text-slate-900">{p.address}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {USE_OPTIONS.find((o) => o.value === r.propertyUse)?.label}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-extrabold text-white ${gradeTone(r.dealRating.grade)}`}>
              {r.dealRating.grade}
            </div>
            <div className="text-xs">
              <div className="font-semibold text-slate-700">Deal rating</div>
              {r.dealRating.score != null ? <div className="text-slate-500">{r.dealRating.score}/100</div> : null}
            </div>
          </div>
        </div>
        {r.dealRating.rationale ? (
          <p className="mt-3 text-sm text-slate-600">{r.dealRating.rationale}</p>
        ) : null}
      </section>

      {/* Location map */}
      {r.locationMap ? (
        <Card title="Location">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.locationMap.dataUrl} alt="Location map" className="w-full rounded-xl border border-slate-200" />
        </Card>
      ) : null}

      {/* Value */}
      <Card title="Estimated value">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-slate-200">
          {[
            ["Low", r.estimate.low, "text-slate-700"],
            ["Estimated", r.estimate.estimatedValue, "text-emerald-700"],
            ["High", r.estimate.high, "text-slate-700"],
          ].map(([label, val, tone]) => (
            <div key={label as string} className="bg-white p-4 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label as string}</div>
              <div className={`mt-1 text-lg font-bold tabular-nums ${tone as string}`}>{money(val as number | null)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Property details */}
      <Card title="Property details">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {detail("Beds", p.beds != null ? String(p.beds) : "—")}
          {detail("Baths", p.baths != null ? String(p.baths) : "—")}
          {detail("Sqft", p.sqft ? p.sqft.toLocaleString() : "—")}
          {detail("Type", p.propertyType ?? "—")}
          {detail("Year built", p.yearBuilt ? String(p.yearBuilt) : "—")}
          {detail("HOA", p.hoaMonthly ? `$${Math.round(p.hoaMonthly)}/mo` : "—")}
          {detail("$/sqft", r.estimate.avgPricePerSqft ? `$${Math.round(r.estimate.avgPricePerSqft)}` : "—")}
        </div>
      </Card>

      {/* Affordability */}
      <Card title="Loan affordability">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <Row label="Price" value={money(a.price)} />
            <Row label={`Down payment (${a.assumptions.downPct}%)`} value={money(a.downPayment)} />
            <Row label="Loan amount" value={money(a.loanAmount)} />
            <Row label={`Principal & interest (${a.assumptions.ratePct}% / ${a.assumptions.termYears}yr)`} value={`${money(a.principalInterest)}/mo`} />
            <Row label="Property tax" value={`${money(a.taxesMonthly)}/mo`} />
            <Row label="Insurance" value={`${money(a.insuranceMonthly)}/mo`} />
            {a.hoaMonthly ? <Row label="HOA" value={`${money(a.hoaMonthly)}/mo`} /> : null}
          </div>
          <div className="flex flex-col justify-center gap-3 rounded-xl bg-emerald-50 p-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Total monthly (PITI)</div>
              <div className="text-2xl font-extrabold text-emerald-800">{money(a.totalMonthly)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Income needed</div>
              <div className="text-lg font-bold text-emerald-800">{money(a.incomeNeededAnnual)}/yr</div>
              <div className="text-[11px] text-emerald-700">at a 28% housing ratio</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Investment */}
      {inv ? (
        <Card title="Investment returns">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {detail("Est. rent", `${money(inv.rentMonthly)}/mo`)}
            {detail("Cash flow", `${money(inv.monthlyCashFlow)}/mo`)}
            {detail("Cap rate", pct(inv.capRatePct))}
            {detail("Cash-on-cash", pct(inv.cashOnCashPct))}
            {detail("Gross rent mult.", inv.grossRentMultiplier ? inv.grossRentMultiplier.toFixed(1) : "—")}
            {detail("Cash invested", money(inv.cashInvested))}
          </div>
          {inv.rentSummary ? <p className="mt-2 text-xs text-slate-500">{inv.rentSummary}</p> : null}
        </Card>
      ) : null}

      {/* Neighborhood */}
      {r.neighborhood ? (
        <Card title="Neighborhood">
          <p className="whitespace-pre-wrap text-sm text-slate-700">{r.neighborhood}</p>
        </Card>
      ) : null}

      {/* Schools */}
      {r.schools.length ? (
        <Card title="Schools">
          <table className="w-full text-sm">
            <tbody>
              {r.schools.map((s, i) => (
                <tr key={i} className="border-t border-slate-100 first:border-0">
                  <td className="py-1.5 text-slate-800">{s.name}</td>
                  <td className="py-1.5 text-slate-600">{s.level ?? "—"}</td>
                  <td className="py-1.5 text-slate-600">{s.rating ?? "—"}</td>
                  <td className="py-1.5 text-right text-slate-600">{s.distance ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* Comps */}
      <Card title={`Comparable sales (${r.comps.length})`}>
        {r.comps.length === 0 ? (
          <p className="text-sm text-slate-500">No comparable sales found.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {r.comps.slice(0, 8).map((c, i) => (
                <tr key={i} className="border-t border-slate-100 first:border-0">
                  <td className="py-1.5 text-slate-800">{c.address}</td>
                  <td className="py-1.5 text-right text-slate-600">{c.soldDate ?? "—"}</td>
                  <td className="py-1.5 text-right font-semibold text-slate-900">{money(c.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{r.disclaimer}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold tabular-nums text-slate-800">{value}</span>
    </div>
  );
}
