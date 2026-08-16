"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { getFinancialServicesTheme } from "@/lib/financial-services/theme";
import { intlLocale } from "@/lib/i18n/locale";

/**
 * Public, GFI-themed, print-to-PDF carrier integration deep-dive.
 *
 * Shareable URL: /financial-services/carrier-integration
 * Auto-print:    /financial-services/carrier-integration?print=1
 */

const SURFACES = [
  {
    tool: "WinFlex / iGo",
    owner: "iPipeline",
    capability: "Submit illustration request → receive PDF + structured quote; submit e-application",
    hard: "Medium — needs iPipeline partner agreement + per-carrier opt-in",
  },
  {
    tool: "FireLight",
    owner: "Insurance Technologies",
    capability: "Submit e-application; track underwriting status",
    hard: "Medium — similar partner-agreement model",
  },
  {
    tool: "TransACT",
    owner: "Transamerica",
    capability: "Single-carrier (Transamerica-only); limited public API + developer-portal endpoints",
    hard: "Hard — must go through Transamerica tech relations",
  },
  {
    tool: "NIPR",
    owner: "NAIC / NIPR",
    capability: "Producer license lookup, CE status, state appointments",
    hard: "Easy — standard subscription API, ~$200–500/mo",
  },
];

const HURDLES = [
  {
    title: "Vendor partner agreements",
    body: "iPipeline doesn't open its API to anyone with a credit card. Partner program with contractual terms, per-transaction fees, vetting. Same with Insurance Technologies (FireLight).",
  },
  {
    title: "Per-carrier opt-in",
    body: "Even with the vendor agreement, each carrier individually decides whether to enable an integration partner for their producers. Transamerica is a separate negotiation from Nationwide.",
  },
  {
    title: "Costs",
    body: "iPipeline agreements typically include per-transaction fees ($0.50–$5 per illustration submitted) on top of platform licensing. That eats into per-producer/mo pricing, which is why we phase it.",
  },
  {
    title: "Identity / auth",
    body: "Producer credentials live with the carrier, not us. Either we OAuth on their behalf (carrier must support it) or operate service-to-service (carrier must issue delegated credentials).",
  },
  {
    title: "Liability",
    body: "If integration submits a wrong illustration and the producer presents it to a client, who's on the hook? Vendor contracts spell this out. Carriers typically want indemnity from the integrator.",
  },
];

export default function CarrierIntegrationClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const theme = getFinancialServicesTheme();
  const params = useSearchParams();
  const partnerLabel = theme.partnerName || "Financial Services";
  const today = new Date().toLocaleDateString(locale, { year: "numeric", month: "long" });

  useEffect(() => {
    if (params?.get("print") === "1") {
      setTimeout(() => window.print(), 400);
    }
  }, [params]);

  return (
    <>
      <style>{`
        @media print {
          @page { size: Letter; margin: 0.45in 0.5in; }
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
        @media screen { body { background: #f1f5f9; } }
      `}</style>

      <div className="no-print mx-auto flex max-w-[8.5in] items-center justify-between gap-3 px-2 pt-6 pb-3">
        <p className="text-sm text-slate-600">{t("pages.carrierIntegration.brief")}</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" />{t("pages.carrierIntegration.saveAsPdf")}</button>
      </div>

      <article className="print-page mx-auto my-4 max-w-[8.5in] overflow-hidden bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200/60">
        {/* Hero */}
        <header className={`${theme.heroBg} relative px-10 py-6 text-white`}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
                Integration brief · {today}
              </p>
              <h1 className="mt-1 text-[24pt] font-semibold leading-[1.05] tracking-tight">
                Carrier{" "}
                <span className={theme.accentText}>{t("pages.carrierIntegration.planTail")}</span>
              </h1>
              <p className="mt-2 max-w-[5.5in] text-[11pt] leading-snug text-white/85">{t("pages.carrierIntegration.intro")}</p>
            </div>
          </div>
          <div
            className={`absolute inset-x-0 bottom-0 h-1.5 ${
              theme.partnerName === "GFI" ? "bg-amber-400"
                : theme.partnerName === "WFG" ? "bg-red-500"
                : theme.partnerName === "PFO" ? "bg-emerald-400"
                : "bg-indigo-400"
            }`}
          />
        </header>

        <section className="space-y-6 px-10 py-7 text-[10.5pt] leading-[1.55] text-slate-800">
          {/* Surfaces table */}
          <div className="avoid-break">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.carrierIntegration.fourSurfaces")}</h2>
            <table className="mt-2 w-full border-collapse text-[9.5pt]">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[8pt] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-1.5 pr-3">{t("pages.carrierIntegration.tool")}</th>
                  <th className="py-1.5 pr-3">{t("pages.carrierIntegration.owner")}</th>
                  <th className="py-1.5 pr-3">{t("pages.carrierIntegration.whatsPossible")}</th>
                  <th className="py-1.5">{t("pages.carrierIntegration.howHard")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SURFACES.map((s) => (
                  <tr key={s.tool}>
                    <td className="py-1.5 pr-3 font-semibold text-slate-900">{s.tool}</td>
                    <td className="py-1.5 pr-3 text-slate-700">{s.owner}</td>
                    <td className="py-1.5 pr-3 text-slate-700">{s.capability}</td>
                    <td className="py-1.5 text-slate-700">{s.hard}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phase 2A */}
          <div className="avoid-break rounded-xl bg-emerald-50/60 px-5 py-4 ring-1 ring-emerald-100">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[12pt] font-semibold text-emerald-900">{t("pages.carrierIntegration.p2aTitle")}</h2>
              <span className="rounded-full bg-emerald-200 px-3 py-0.5 text-[9pt] font-semibold uppercase tracking-wider text-emerald-900">{t("pages.carrierIntegration.p2aWhen")}</span>
            </div>
            <p className="mt-2 text-[10pt] text-slate-700">{t("pages.carrierIntegration.p2aSub")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[10pt] text-slate-700">
              <li><strong>{t("pages.carrierIntegration.p2aItem1")}</strong>: producer license status, expirations, CE credits, state appointments. Standard subscription API. We commit confidently.</li>
              <li><strong>{t("pages.carrierIntegration.p2aItem2")}</strong>: producer-level activity feed — illustrations already generated, applications in flight. Displayed alongside our pipeline view.</li>
              <li><strong>{t("pages.carrierIntegration.p2aItem3")}</strong></li>
            </ul>
            <p className="mt-2 text-[9.5pt] italic text-slate-700">
              <strong>{t("pages.carrierIntegration.p2aEndLabel")}</strong>{t("pages.carrierIntegration.p2aEnd")}</p>
          </div>

          {/* Phase 2B */}
          <div className="avoid-break rounded-xl bg-indigo-50/60 px-5 py-4 ring-1 ring-indigo-100">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[12pt] font-semibold text-indigo-900">{t("pages.carrierIntegration.p2bTitle")}</h2>
              <span className="rounded-full bg-indigo-200 px-3 py-0.5 text-[9pt] font-semibold uppercase tracking-wider text-indigo-900">{t("pages.carrierIntegration.p2bWhen")}</span>
            </div>
            <p className="mt-2 text-[10pt] text-slate-700">
              The &quot;FNA → polished carrier illustration → kitchen-table presentation&quot; loop, end-to-end.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[10pt] text-slate-700">
              <li>{t("pages.carrierIntegration.p2bItem1")}</li>
              <li>{t("pages.carrierIntegration.p2bItem2")}</li>
              <li>{t("pages.carrierIntegration.p2bItem3")}</li>
              <li>{t("pages.carrierIntegration.p2bItem4")}</li>
              <li>{t("pages.carrierIntegration.p2bItem5")}</li>
            </ul>
            <p className="mt-2 text-[9.5pt] italic text-slate-700">
              <strong>{t("pages.carrierIntegration.p2bWhyLabel")}</strong>{t("pages.carrierIntegration.p2bWhy")}</p>
          </div>

          {/* Phase 3 */}
          <div className="avoid-break rounded-xl bg-amber-50/60 px-5 py-4 ring-1 ring-amber-100">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[12pt] font-semibold text-amber-900">{t("pages.carrierIntegration.p3Title")}</h2>
              <span className="rounded-full bg-amber-200 px-3 py-0.5 text-[9pt] font-semibold uppercase tracking-wider text-amber-900">
                6–12+ months
              </span>
            </div>
            <p className="mt-2 text-[10pt] text-slate-700">
              Highest regulatory + liability complexity. Held until the pilot proves out and {partnerLabel}&apos;s principal/OSJ is committed to running the compliance review with us.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[10pt] text-slate-700">
              <li>{t("pages.carrierIntegration.p3Item1")}</li>
              <li>{t("pages.carrierIntegration.p3Item2")}</li>
              <li>{t("pages.carrierIntegration.p3Item3")}</li>
              <li>{t("pages.carrierIntegration.p3Item4")}</li>
            </ul>
          </div>

          {/* Hurdles */}
          <div className="avoid-break">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.carrierIntegration.hurdles")}</h2>
            <p className="mt-1.5 text-[10pt] text-slate-700">{t("pages.carrierIntegration.hurdlesSub")}</p>
            <ol className="mt-2 space-y-2 text-[10pt]">
              {HURDLES.map((h, i) => (
                <li key={h.title} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[9pt] font-semibold uppercase tracking-wider text-slate-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-[10.5pt] font-semibold text-slate-900">{h.title}</h3>
                  </div>
                  <p className="mt-1 text-[9.5pt] text-slate-700">{h.body}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* GFI-specific shortcut */}
          <div className="avoid-break rounded-xl bg-slate-900 px-5 py-4 text-white">
            <p className="text-[8.5pt] font-semibold uppercase tracking-wider text-white/60">
              The {partnerLabel}-specific shortcut
            </p>
            <h2 className="mt-1.5 text-[14pt] font-semibold leading-snug">
              {partnerLabel} brings a leverage point{" "}
              <span className={theme.accentText}>{t("pages.carrierIntegration.noOtherAgency")}</span>
            </h2>
            <p className="mt-2 text-[9.5pt] leading-snug text-white/85">
              Transamerica&apos;s internal tools (TransACT, their illustration platform) are theoretically more accessible to us through {partnerLabel}&apos;s existing carrier relationship than they are to any random CRM vendor. If {partnerLabel}&apos;s leadership has executive contacts inside Transamerica&apos;s tech relations team, they can request that LeadSmart AI be approved as an integration partner for {partnerLabel}-affiliated producers.
            </p>
            <div
              className={`mt-3 rounded-lg border border-white/15 bg-white/5 px-4 py-3 ${theme.accentText}`}
            >
              <p className="text-[9pt] font-semibold uppercase tracking-wider opacity-80">{t("pages.carrierIntegration.theAsk")}</p>
              <p className="mt-1 text-[10pt] leading-snug text-white">
                &quot;If we sign the pilot, can you make a single introduction to Transamerica tech relations? That alone moves our Phase 2B timeline from 4 months to 6 weeks.&quot;
              </p>
            </div>
          </div>

          {/* What we commit vs roadmap */}
          <div className="avoid-break">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.carrierIntegration.commitVsRoadmap")}</h2>
            <div className="mt-2 space-y-2 text-[9.5pt]">
              <div className="flex items-start gap-3 rounded-lg bg-emerald-50/60 px-3 py-2 ring-1 ring-emerald-100">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-[10pt] font-bold text-emerald-900">✓</span>
                <p className="text-slate-700"><strong>{t("pages.carrierIntegration.commitLabel")}</strong> NIPR license tracking (Phase 2A). $200–500/mo subscription, no partner gates.</p>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-indigo-50/60 px-3 py-2 ring-1 ring-indigo-100">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-200 text-[10pt] font-bold text-indigo-900">~</span>
                <p className="text-slate-700"><strong>{t("pages.carrierIntegration.conditionsLabel")}</strong>{t("pages.carrierIntegration.conditions")}</p>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-amber-50/60 px-3 py-2 ring-1 ring-amber-100">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[10pt] font-bold text-amber-900">→</span>
                <p className="text-slate-700"><strong>{t("pages.carrierIntegration.acceleratedLabel")}</strong>{t("pages.carrierIntegration.accelerated")}</p>
              </div>
              <div className="flex items-start gap-3 rounded-lg bg-slate-100 px-3 py-2 ring-1 ring-slate-200">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[10pt] font-bold text-slate-700">?</span>
                <p className="text-slate-700"><strong>{t("pages.carrierIntegration.roadmapLabel")}</strong>{t("pages.carrierIntegration.roadmap")}</p>
              </div>
            </div>
            <p className="mt-2 text-[9pt] italic text-slate-600">{t("pages.carrierIntegration.neverPromise")}</p>
          </div>

          {/* Verbatim live answer */}
          <div className="avoid-break rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-5 py-4">
            <p className="text-[8.5pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.carrierIntegration.verbatim")}</p>
            <p className="mt-2 text-[10pt] leading-snug text-slate-800">
              &quot;Yes — and the gating factor is vendor agreements, not code. We have a 3-phase plan: NIPR + iPipeline read-only in pilot Phase 2A, WinFlex illustration submission in 2B, and e-app in Phase 3. The Phase 2B and 3 work moves dramatically faster if {partnerLabel} introduces us to their Transamerica relationship — that&apos;s one of the things being a pilot partner actually gets you.&quot;
            </p>
          </div>
        </section>

        <footer className="border-t border-slate-100 bg-slate-50 px-10 py-3.5 text-[8.5pt] text-slate-600">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">CloseBoss AI</p>
              <p>closebossai.com · pilot inquiries welcome</p>
            </div>
            <p className="text-right text-[7.5pt] text-slate-400">
              Confidential — prepared for {partnerLabel} leadership.
            </p>
          </div>
        </footer>
      </article>

      <div className="no-print mx-auto max-w-[8.5in] px-2 py-4 text-center text-xs text-slate-500">{t("pages.carrierIntegration.printTip")}<strong>{t("pages.carrierIntegration.letter")}</strong> with{" "}
        <strong>{t("pages.carrierIntegration.defaultMargins")}</strong> and <strong>{t("pages.carrierIntegration.backgroundGraphics")}</strong>{t("pages.carrierIntegration.keepColors")}</div>
    </>
  );
}
