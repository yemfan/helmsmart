"use client";

import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

import { downloadComparisonReportPdf } from "@/components/comparison-report/downloadComparisonPdf";
import ShareReport from "@/components/share/ShareReport";
import type { DeepReport } from "@/lib/deep-report/types";

/**
 * Single source of truth for rendering a Property Deep Report — used by the
 * dashboard generator and the public /deep-report/[id] share page, so they
 * can't drift. Owns the PDF export (html2canvas of the rendered body).
 */

const USE_LABEL: Record<string, string> = {
  primary: "Primary residence",
  second_home: "Second home",
  investment: "Investment / rental",
};

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${Math.round(n).toLocaleString()}`;
const pct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(1)}%`;

function gradeTone(grade: string): string {
  const g = grade.charAt(0).toUpperCase();
  if (g === "A") return "bg-emerald-600";
  if (g === "B") return "bg-emerald-500";
  if (g === "C") return "bg-amber-500";
  if (g === "D") return "bg-orange-500";
  if (g === "F") return "bg-rose-600";
  return "bg-slate-400";
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {title ? <h2 className="mb-2 text-sm font-semibold text-slate-900">{title}</h2> : null}
      {children}
    </section>
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

export default function DeepReportView({
  report: r,
  showDownload = true,
  shareUrl = null,
}: {
  report: DeepReport;
  showDownload?: boolean;
  /** Public share URL (dashboard only) → enables the full Share menu. */
  shareUrl?: string | null;
}) {
  const { t } = useTranslation("dashboard");
  const ref = useRef<HTMLDivElement>(null);
  const onDownload = useCallback(async () => {
    if (ref.current) await downloadComparisonReportPdf(ref.current, "property-deep-report.pdf");
  }, []);

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
    <div className="space-y-4">
      {showDownload ? (
        <div className="flex justify-end">
          <ShareReport
            shareUrl={shareUrl}
            onDownloadPdf={onDownload}
            subject={`Property Deep Report — ${p.address}`}
            resourceLabel={`the property report for ${p.address}`}
          />
        </div>
      ) : null}

      <div ref={ref} className="space-y-5 bg-slate-50 p-1">
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
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.deepReportView.title")}</div>
          <div className="mt-1 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="text-2xl font-bold text-slate-900">{p.address}</div>
              <div className="mt-0.5 text-xs text-slate-500">{USE_LABEL[r.propertyUse] ?? r.propertyUse}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-extrabold text-white ${gradeTone(r.dealRating.grade)}`}>
                {r.dealRating.grade}
              </div>
              <div className="text-xs">
                <div className="font-semibold text-slate-700">{t("pages.deepReportView.dealRating")}</div>
                {r.dealRating.score != null ? <div className="text-slate-500">{r.dealRating.score}/100</div> : null}
              </div>
            </div>
          </div>
          {r.dealRating.rationale ? <p className="mt-3 text-sm text-slate-600">{r.dealRating.rationale}</p> : null}
        </section>

        {/* Location map */}
        {r.locationMap ? (
          <Card title={t("pages.labels.location")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.locationMap.dataUrl} alt={t("pages.deepReportView.locationMap")} className="w-full rounded-xl border border-slate-200" />
          </Card>
        ) : null}

        {/* Value */}
        <Card title={t("pages.deepReportView.estValue")}>
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
        <Card title={t("pages.deepReportView.propertyDetails")}>
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
        <Card title={t("pages.deepReportView.loanAffordability")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1 text-sm">
              <Row label={t("pages.labels.price")} value={money(a.price)} />
              <Row label={`Down payment (${a.assumptions.downPct}%)`} value={money(a.downPayment)} />
              <Row label={t("pages.deepReportView.loanAmount")} value={money(a.loanAmount)} />
              <Row label={`P&I (${a.assumptions.ratePct}% / ${a.assumptions.termYears}yr)`} value={`${money(a.principalInterest)}/mo`} />
              <Row label={t("pages.deepReportView.propertyTax")} value={`${money(a.taxesMonthly)}/mo`} />
              <Row label={t("pages.labels.insurance")} value={`${money(a.insuranceMonthly)}/mo`} />
              <Row label={t("pages.labels.hoa")} value={`${money(a.hoaMonthly)}/mo`} />
              <Row label={t("pages.labels.melloRoos")} value={`${money(a.melloRoosMonthly)}/mo`} />
            </div>
            <div className="flex flex-col justify-center gap-3 rounded-xl bg-emerald-50 p-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{t("pages.deepReportView.totalMonthly")}</div>
                <div className="text-2xl font-extrabold text-emerald-800">{money(a.totalMonthly)}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{t("pages.deepReportView.incomeNeeded")}</div>
                <div className="text-lg font-bold text-emerald-800">{money(a.incomeNeededAnnual)}/yr</div>
                <div className="text-[11px] text-emerald-700">{t("pages.deepReportView.housingRatio")}</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Investment */}
        {inv ? (
          <Card title={t("pages.deepReportView.investmentReturns")}>
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
          <Card title={t("pages.labels.neighborhood")}>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{r.neighborhood}</p>
          </Card>
        ) : null}

        {/* Schools */}
        {r.schools.length ? (
          <Card title={t("pages.labels.schools")}>
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
            <p className="text-sm text-slate-500">{t("pages.deepReportView.noComps")}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {r.comps.slice(0, 8).map((c, i) => {
                  const facts = [
                    c.beds != null ? `${c.beds} bd` : null,
                    c.baths != null ? `${c.baths} ba` : null,
                    c.sqft ? `${c.sqft.toLocaleString()} sqft` : null,
                    c.propertyType,
                    c.yearBuilt ? `built ${c.yearBuilt}` : null,
                  ].filter(Boolean);
                  return (
                    <tr key={i} className="border-t border-slate-100 align-top first:border-0">
                      <td className="py-1.5 pr-3 text-slate-800">
                        <div>{c.address}</div>
                        {facts.length ? (
                          <div className="mt-0.5 text-xs text-slate-500">{facts.join(" · ")}</div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap py-1.5 text-right text-slate-600">{c.soldDate ?? "—"}</td>
                      <td className="whitespace-nowrap py-1.5 pl-3 text-right font-semibold text-slate-900">{money(c.price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{r.disclaimer}</p>
      </div>
    </div>
  );
}
