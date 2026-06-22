"use client";

import { useCallback, useRef, useState } from "react";
import type { ComparisonReportRow } from "@/lib/comparisonReportTypes";
import { downloadComparisonReportPdf } from "./downloadComparisonPdf";

function fmtMoney(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ComparisonReportClient({ report }: { report: ComparisonReportRow }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formStatus, setFormStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [formError, setFormError] = useState<string | null>(null);

  const r = report.result;
  const fallbackBest =
    r.scored.length > 0
      ? r.scored.reduce((a, b) => (a.score.total >= b.score.total ? a : b)).property.id
      : "";
  const bestId = r.scored.some((s) => s.property.id === r.best_property_id)
    ? r.best_property_id
    : fallbackBest;
  const agent = r.agent_snapshot;

  const onDownloadPdf = useCallback(async () => {
    const el = printRef.current;
    if (!el) return;
    setPdfLoading(true);
    try {
      await downloadComparisonReportPdf(el, `comparison-report-${report.id.slice(0, 8)}.pdf`);
    } finally {
      setPdfLoading(false);
    }
  }, [report.id]);

  async function submitInquiry(e: React.FormEvent) {
    e.preventDefault();
    setFormStatus("sending");
    setFormError(null);
    try {
      const res = await fetch(`/api/comparison-reports/${report.id}/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          message: formMessage,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to send");
      }
      setFormStatus("sent");
      setFormName("");
      setFormEmail("");
      setFormMessage("");
    } catch (err: any) {
      setFormStatus("error");
      setFormError(err?.message ?? "Could not send");
    }
  }

  const created = new Date(report.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Toolbar — hidden when printing via browser if user uses print */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <p className="text-sm text-slate-500">Prepared {created}</p>
        <button
          type="button"
          onClick={onDownloadPdf}
          disabled={pdfLoading}
          className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
        >
          {pdfLoading ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>

      <div
        ref={printRef}
        id="comparison-report-print-root"
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 lg:p-12"
      >
        {/* Header */}
        <header className="border-b border-slate-200 pb-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0066b3]">
            AI Property Comparison Report
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Prepared for {report.client_name}
          </h1>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Your agent</p>
              <div className="mt-2 flex items-center gap-3">
                {agent.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={agent.photo_url}
                    alt=""
                    crossOrigin="anonymous"
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-slate-900">
                    {agent.display_name ?? "Your real estate professional"}
                  </p>
                  {agent.brokerage ? <p className="text-slate-600">{agent.brokerage}</p> : null}
                  {agent.license_number ? (
                    <p className="text-xs text-slate-500">Lic #{agent.license_number}</p>
                  ) : null}
                  {(agent.phone || agent.email) ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[agent.phone, agent.email].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="text-sm text-slate-600">
              <p>
                <span className="font-medium text-slate-800">Report date:</span> {created}
              </p>
              <p className="mt-1 text-xs text-slate-400">Reference ID: {report.id}</p>
            </div>
          </div>
        </header>

        {/* Executive summary */}
        <section className="mt-12 space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Executive summary</h2>
          <p className="text-lg leading-relaxed text-slate-700">{r.executive_summary}</p>
        </section>

        {/* Comparison table */}
        <section className="mt-14 space-y-6">
          <h2 className="text-xl font-bold text-slate-900">Comparison overview</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 font-semibold text-slate-700">Property</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Price</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">$/sqft</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Est. ROI / yr</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Score</th>
                </tr>
              </thead>
              <tbody>
                {r.scored.map(({ property: p, score }) => {
                  const isBest = p.id === bestId;
                  return (
                    <tr
                      key={p.id}
                      className={
                        isBest
                          ? "border-l-4 border-l-emerald-500 bg-emerald-50/80"
                          : "border-b border-slate-100"
                      }
                    >
                      <td className="max-w-[200px] px-4 py-3">
                        <div className="font-medium text-slate-900">{p.address}</div>
                        {isBest ? (
                          <span className="mt-1 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                            Recommended
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{fmtMoney(p.price)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{fmtMoney(score.metrics.pricePerSqft)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {score.metrics.estimatedAnnualRoiPct != null
                          ? `${score.metrics.estimatedAnnualRoiPct.toFixed(2)}%`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                        {score.total}
                        <span className="text-xs font-normal text-slate-500"> /100</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Property breakdown */}
        <section className="mt-14 space-y-8">
          <h2 className="text-xl font-bold text-slate-900">Property breakdown</h2>
          <div className="space-y-8">
            {r.scored.map(({ property: p, score }) => (
              <div
                key={p.id}
                className={`rounded-xl border p-6 ${
                  p.id === bestId ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-slate-50/50"
                }`}
              >
                <h3 className="font-semibold text-slate-900">{p.address}</h3>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">List / price</dt>
                    <dd className="font-medium text-slate-900">{fmtMoney(p.price)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Size</dt>
                    <dd className="font-medium text-slate-900">
                      {p.sqft.toLocaleString()} sqft · {p.beds} bd / {p.baths} ba
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Investment score</dt>
                    <dd className="font-medium text-slate-900">{score.total} / 100</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Dimensions</dt>
                    <dd className="text-slate-700">
                      Financial {score.breakdown.financial} · Location {score.breakdown.location} · Property{" "}
                      {score.breakdown.property} · Market {score.breakdown.market}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>

        {/* AI insight */}
        <section className="mt-14 space-y-6 rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50/80 to-white p-6 sm:p-8">
          <h2 className="text-xl font-bold text-slate-900">AI recommendation</h2>
          <p className="leading-relaxed text-slate-800">{r.best_property_explanation}</p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-bold uppercase text-emerald-700">Pros</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                {r.pros.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase text-amber-800">Cons</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                {r.cons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="mt-14 border-t border-slate-200 pt-10 print:break-inside-avoid">
          <h2 className="text-xl font-bold text-slate-900">Contact your agent</h2>
          <p className="mt-2 text-slate-600">
            Questions about this comparison? Reach out directly or send a message below.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {agent.phone ? (
              <a
                href={`tel:${String(agent.phone).replace(/\D/g, "")}`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Call {agent.phone}
              </a>
            ) : null}
            {agent.email ? (
              <a
                href={`mailto:${agent.email}`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Email agent
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => setFormOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {formOpen ? "Close form" : "Message form"}
            </button>
          </div>

          {formOpen ? (
            <form onSubmit={submitInquiry} className="mt-8 max-w-lg space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
              <div>
                <label className="block text-xs font-medium text-slate-600">Your name</label>
                <input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Your email</label>
                <input
                  required
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Message (optional)</label>
                <textarea
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
              {formStatus === "sent" ? (
                <p className="text-sm font-medium text-emerald-700">Message sent. Your agent will follow up soon.</p>
              ) : null}
              <button
                type="submit"
                disabled={formStatus === "sending"}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {formStatus === "sending" ? "Sending…" : "Send message"}
              </button>
            </form>
          ) : null}
        </section>

        <footer className="mt-14 border-t border-slate-200 pt-8 text-center text-xs text-slate-400">
          Generated by RealtorBoss · For discussion purposes only · Not financial advice
        </footer>
      </div>
    </div>
  );
}
