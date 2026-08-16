"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { getFinancialServicesTheme } from "@/lib/financial-services/theme";
import { intlLocale } from "@/lib/i18n/locale";

/**
 * Public, GFI-themed, print-to-PDF competitor comparison.
 * Same shell pattern as /financial-services/one-pager.
 *
 * Shareable URL: /financial-services/competitor-comparison
 * Auto-print:    /financial-services/competitor-comparison?print=1
 */

const COLUMNS = [
  "Carrier portals",
  "AgencyBloc / Redtail",
  "Salesforce FSC",
  "Sheets + WhatsApp",
  "CloseBoss AI",
] as const;

type Cell = "yes" | "partial" | "no" | "soon";

const ROWS: { label: string; cells: Cell[] }[] = [
  { label: "Speed-to-lead under 5 minutes", cells: ["no", "partial", "partial", "no", "yes"] },
  { label: "AI Financial Needs Analysis in 60 seconds", cells: ["no", "no", "no", "no", "yes"] },
  { label: "AI SMS / email / voice nurture", cells: ["no", "partial", "partial", "no", "yes"] },
  { label: "Recruit pipeline (Interest → Promoted)", cells: ["no", "no", "partial", "no", "yes"] },
  { label: "Downline hierarchy + roll-up view", cells: ["no", "no", "partial", "no", "yes"] },
  { label: "Override commission accounting", cells: ["no", "no", "partial", "partial", "soon"] },
  { label: "Sit-down booking + reminders", cells: ["no", "partial", "partial", "partial", "yes"] },
  { label: "TCPA opt-in audit", cells: ["no", "partial", "partial", "no", "yes"] },
  { label: "Supervised review queue (principal / OSJ)", cells: ["no", "no", "partial", "no", "yes"] },
  { label: "Communications archive (17a-4 spirit)", cells: ["partial", "yes", "yes", "no", "yes"] },
  { label: "State license + appointment tracking", cells: ["no", "yes", "partial", "no", "soon"] },
  { label: "Annual policy review automation", cells: ["no", "partial", "partial", "no", "soon"] },
  { label: "Carrier illustrations / e-application", cells: ["yes", "partial", "partial", "no", "soon"] },
  { label: "Bilingual SMS / email (ES / MN / VN)", cells: ["no", "partial", "partial", "partial", "yes"] },
  { label: "Mobile-first producer experience", cells: ["partial", "partial", "partial", "yes", "yes"] },
];

const PRICING = ["Free (carrier provides)", "$59–99/mo", "$150–300/mo + impl", "Free", "$39–49/mo"];

function Sym({ cell }: { cell: Cell }) {
  const map: Record<Cell, { ch: string; cls: string; label: string }> = {
    yes: { ch: "✓", cls: "text-emerald-700 bg-emerald-50", label: "Yes" },
    partial: { ch: "~", cls: "text-amber-700 bg-amber-50", label: "Partial" },
    no: { ch: "—", cls: "text-slate-400 bg-slate-50", label: "No" },
    soon: { ch: "◷", cls: "text-indigo-700 bg-indigo-50", label: "Soon" },
  };
  const { ch, cls, label } = map[cell];
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${cls}`}
      title={label}
      aria-label={label}
    >
      {ch}
    </span>
  );
}

export default function CompetitorComparisonClient() {
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

      {/* Toolbar (screen only) */}
      <div className="no-print mx-auto flex max-w-[8.5in] items-center justify-between gap-3 px-2 pt-6 pb-3">
        <p className="text-sm text-slate-600">{t("pages.competitorComparison.brief")}</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" />{t("pages.competitorComparison.saveAsPdf")}</button>
      </div>

      <article
        className="print-page mx-auto my-4 max-w-[8.5in] overflow-hidden bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200/60"
      >
        {/* Hero */}
        <header className={`${theme.heroBg} relative px-10 py-6 text-white`}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
                Competitor brief · {today}
              </p>
              <h1 className="mt-1 text-[24pt] font-semibold leading-[1.05] tracking-tight">{t("pages.competitorComparison.vsThe")}{" "}
                <span className={theme.accentText}>{t("pages.competitorComparison.stackTail")}</span>
              </h1>
              <p className="mt-2 max-w-[5.5in] text-[11pt] leading-snug text-white/85">{t("pages.competitorComparison.honestSideBySide")} {partnerLabel} {t("pages.competitorComparison.useToday")}</p>
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

        {/* Body */}
        <section className="space-y-6 px-10 py-7 text-[10.5pt] leading-[1.55] text-slate-800">
          {/* The five things */}
          <div className="avoid-break">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.competitorComparison.fiveThings")} {partnerLabel} {t("pages.competitorComparison.haveToday")}</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[10pt]">
              <li><strong>{t("pages.competitorComparison.optCarrier")}</strong> — TransACT, WinFlex/iPipeline (illustrations), iGo/FireLight (e-app), individual carrier portals.</li>
              <li><strong>{t("pages.competitorComparison.optAgentCrm")}</strong> — AgencyBloc, Redtail, Wealthbox. Built for traditional independent agents, not MLM hierarchies.</li>
              <li><strong>{t("pages.competitorComparison.optEnterprise")}</strong> — Salesforce Financial Services Cloud, Microsoft Dynamics. Configurable to almost anything with budget and time.</li>
              <li><strong>{t("pages.competitorComparison.optSpreadsheets")}</strong> — the de facto stack most field producers use day-to-day.</li>
              <li><strong>{t("pages.competitorComparison.optInternal")}</strong> — WFG&apos;s MyOffice, Primerica&apos;s POL. Private to each agency — not commercially available to {partnerLabel}.</li>
            </ol>
            <p className="mt-2 text-[10pt] text-slate-700">
              <strong>{t("pages.competitorComparison.sixthOption")}</strong> — purpose-built for MLM financial
              services, not adapted from real estate or generic CRM.
            </p>
          </div>

          {/* Matrix */}
          <div className="avoid-break">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.competitorComparison.atAGlance")}</h2>
            <table className="mt-2 w-full border-collapse text-[9pt]">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[8pt] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-2">{t("pages.competitorComparison.capability")}</th>
                  {COLUMNS.map((c, i) => (
                    <th
                      key={c}
                      className={`py-2 px-1 text-center ${
                        i === COLUMNS.length - 1 ? "text-slate-900" : ""
                      }`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ROWS.map((row) => (
                  <tr key={row.label}>
                    <td className="py-1.5 pr-2 font-medium text-slate-800">{row.label}</td>
                    {row.cells.map((cell, i) => (
                      <td key={i} className="py-1.5 px-1 text-center">
                        <Sym cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td className="py-2 pr-2 text-[8.5pt] font-semibold uppercase tracking-wider text-slate-600">{t("pages.competitorComparison.costPerProducer")}</td>
                  {PRICING.map((p, i) => (
                    <td
                      key={i}
                      className={`py-2 px-1 text-center text-[9pt] tabular-nums ${
                        i === PRICING.length - 1 ? "font-semibold text-slate-900" : "text-slate-700"
                      }`}
                    >
                      {p}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[8.5pt] italic text-slate-500">
              ✓ Native, strong, out-of-the-box · ~ Possible but weak, manual, or paid add-on · — Not solved · ◷ Roadmap
            </p>
          </div>

          {/* Per-competitor deep dive */}
          <div className="avoid-break">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.competitorComparison.carrierTitle")}</h2>
            <div className="mt-1.5 grid grid-cols-2 gap-4 text-[9.5pt]">
              <div>
                <p className="font-semibold text-emerald-700">{t("pages.competitorComparison.greatAt")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                  <li>{t("pages.competitorComparison.carrierGood1")}</li>
                  <li>{t("pages.competitorComparison.carrierGood2")}</li>
                  <li>{t("pages.competitorComparison.carrierGood3")}</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-amber-700">{t("pages.competitorComparison.dontDo")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                  <li>{t("pages.competitorComparison.carrierBad1")}</li>
                  <li>{t("pages.competitorComparison.carrierBad2")}</li>
                  <li>{t("pages.competitorComparison.carrierBad3")}</li>
                </ul>
              </div>
            </div>
            <p className="mt-1.5 text-[9pt] italic text-slate-600">{t("pages.competitorComparison.carrierNote")}</p>
          </div>

          <div className="avoid-break">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">
              AgencyBloc / Redtail CRM
            </h2>
            <div className="mt-1.5 grid grid-cols-2 gap-4 text-[9.5pt]">
              <div>
                <p className="font-semibold text-emerald-700">{t("pages.competitorComparison.greatAt")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                  <li>{t("pages.competitorComparison.crmGood1")}</li>
                  <li>{t("pages.competitorComparison.crmGood2")}</li>
                  <li>{t("pages.competitorComparison.crmGood3")}</li>
                  <li>{t("pages.competitorComparison.crmGood4")}</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-amber-700">{t("pages.competitorComparison.dontDo")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                  <li>{t("pages.competitorComparison.crmBad1")}</li>
                  <li>{t("pages.competitorComparison.crmBad2")}</li>
                  <li>{t("pages.competitorComparison.crmBad3")}</li>
                  <li>{t("pages.competitorComparison.crmBad4")}</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="avoid-break">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">
              Salesforce Financial Services Cloud
            </h2>
            <div className="mt-1.5 grid grid-cols-2 gap-4 text-[9.5pt]">
              <div>
                <p className="font-semibold text-emerald-700">{t("pages.competitorComparison.sfGreatAt")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                  <li>{t("pages.competitorComparison.sfGood1")}</li>
                  <li>{t("pages.competitorComparison.sfGood2")}</li>
                  <li>{t("pages.competitorComparison.sfGood3")}</li>
                  <li>{t("pages.competitorComparison.sfGood4")}</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-amber-700">{t("pages.competitorComparison.sfDontDo")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                  <li>{t("pages.competitorComparison.sfBad1")}</li>
                  <li>{t("pages.competitorComparison.sfBad2")}</li>
                  <li>{t("pages.competitorComparison.sfBad3")}</li>
                  <li>$150–300/user/mo + implementation projects 6–18 months</li>
                </ul>
              </div>
            </div>
            <p className="mt-1.5 text-[9pt] italic text-slate-600">
              The &quot;we&apos;ll build it ourselves with consultants&quot; option.
              Time-to-value 9–18 months. Math doesn&apos;t work for a field producer with a $100/mo policy in pipeline.
            </p>
          </div>

          <div className="avoid-break">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.competitorComparison.realityTitle")}</h2>
            <div className="mt-1.5 grid grid-cols-2 gap-4 text-[9.5pt]">
              <div>
                <p className="font-semibold text-emerald-700">{t("pages.competitorComparison.sfGreatAt")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                  <li>{t("pages.competitorComparison.realGood1")}</li>
                  <li>{t("pages.competitorComparison.realGood2")}</li>
                  <li>{t("pages.competitorComparison.realGood3")}</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-amber-700">{t("pages.competitorComparison.realDontDo")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-700">
                  <li>{t("pages.competitorComparison.realBad1")}</li>
                  <li>{t("pages.competitorComparison.realBad2")}</li>
                  <li><strong>{t("pages.competitorComparison.realBad3Label")}</strong>{t("pages.competitorComparison.realBad3")}</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Where we win */}
          <div className="avoid-break rounded-xl bg-emerald-50/60 px-5 py-4 ring-1 ring-emerald-100">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-emerald-800">{t("pages.competitorComparison.whereWeWin")}</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[9.5pt] text-slate-800">
              <li><strong>{t("pages.competitorComparison.win1Label")}</strong>{t("pages.competitorComparison.win1")}</li>
              <li><strong>{t("pages.competitorComparison.win2")}</strong> 14 pre-approved templates, state-disclosure injection, supervised review queue.</li>
              <li><strong>{t("pages.competitorComparison.win3")}</strong> 6-stage MLM funnel + fit-scoring + sponsor attribution + downline view, first-class.</li>
              <li><strong>{t("pages.competitorComparison.win4Label")}</strong>{t("pages.competitorComparison.win4")}</li>
            </ol>
          </div>

          {/* Where we're behind */}
          <div className="avoid-break rounded-xl bg-amber-50/60 px-5 py-4 ring-1 ring-amber-100">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-amber-800">{t("pages.competitorComparison.behindTitle")}</h2>
            <table className="mt-2 w-full text-[9pt]">
              <thead className="text-[8pt] font-semibold uppercase tracking-wider text-amber-800/80">
                <tr className="border-b border-amber-200">
                  <th className="py-1 pr-2 text-left">{t("pages.competitorComparison.gap")}</th>
                  <th className="py-1 px-2 text-left">{t("pages.competitorComparison.today")}</th>
                  <th className="py-1 pl-2 text-left">{t("pages.competitorComparison.timeline")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                <tr><td className="py-1.5 pr-2 font-semibold">{t("pages.competitorComparison.gap1")}</td><td className="py-1.5 px-2 text-slate-700">{t("pages.competitorComparison.gap1Today")}</td><td className="py-1.5 pl-2 text-slate-900">{t("pages.competitorComparison.phase2")}</td></tr>
                <tr><td className="py-1.5 pr-2 font-semibold">{t("pages.competitorComparison.gap2")}</td><td className="py-1.5 px-2 text-slate-700">{t("pages.competitorComparison.gap2Today")}</td><td className="py-1.5 pl-2 text-slate-900">{t("pages.competitorComparison.phase2")}</td></tr>
                <tr><td className="py-1.5 pr-2 font-semibold">{t("pages.competitorComparison.gap3")}</td><td className="py-1.5 px-2 text-slate-700">{t("pages.competitorComparison.gap3Today")}</td><td className="py-1.5 pl-2 text-slate-900">{t("pages.competitorComparison.gap3When")}</td></tr>
                <tr><td className="py-1.5 pr-2 font-semibold">{t("pages.competitorComparison.gap4")}</td><td className="py-1.5 px-2 text-slate-700">{t("pages.competitorComparison.gap4Today")}</td><td className="py-1.5 pl-2 text-slate-900">{t("pages.competitorComparison.gap4When")}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Strategic positioning */}
          <div className="avoid-break rounded-xl bg-slate-900 px-5 py-4 text-white">
            <p className="text-[8.5pt] font-semibold uppercase tracking-wider text-white/60">{t("pages.competitorComparison.oneSentence")}</p>
            <p className="mt-1.5 text-[12pt] font-semibold leading-snug">{t("pages.competitorComparison.oneSentence1")}<span className={theme.accentText}>{t("pages.competitorComparison.oneSentence2")}</span>
            </p>
            <p className="mt-2 text-[9pt] leading-snug text-white/80">
              Carrier portals handle policy admin. AgencyBloc handles back-office. Salesforce can be customized to almost anything with a year and a six-figure budget. Spreadsheets handle today. None of them were built around the MLM-financial-services flow: capture → 5-minute nurture → FNA in 60 seconds → kitchen-table sit → close → recruit. That cycle is the engine of {partnerLabel}&apos;s growth, and it&apos;s the cycle we built around.
            </p>
          </div>

          {/* Demo snippets */}
          <div className="avoid-break">
            <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.competitorComparison.snippets")}</h2>
            <div className="mt-2 space-y-2 text-[9pt] leading-snug text-slate-700">
              <p>
                <strong className="text-slate-900">&quot;How is this different from AgencyBloc?&quot;</strong>{" "}{t("pages.competitorComparison.agencyBlocA1")} {partnerLabel} {t("pages.competitorComparison.agencyBlocA2")}</p>
              <p>
                <strong className="text-slate-900">&quot;What about Salesforce FSC?&quot;</strong>{" "}
                FSC is the &quot;we&apos;ll build it ourselves with $200k and 12 months&quot; option. The math doesn&apos;t work for a field producer with a $1,200/year policy in their pipeline. We&apos;re 1/4 the cost and shipping in 2 weeks, not 12 months.
              </p>
              <p>
                <strong className="text-slate-900">&quot;Why not just keep using spreadsheets?&quot;</strong>{" "}{t("pages.competitorComparison.spreadsheetsA")}</p>
              <p>
                <strong className="text-slate-900">&quot;Are you trying to replace the carrier portal?&quot;</strong>{" "}{t("pages.competitorComparison.carrierPortalA")}</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-100 bg-slate-50 px-10 py-3.5 text-[8.5pt] text-slate-600">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">CloseBoss AI</p>
              <p>closebossai.com · pilot inquiries welcome</p>
            </div>
            <p className="text-right text-[7.5pt] text-slate-400">{t("pages.competitorComparison.confidentialFor")} {partnerLabel} leadership.
            </p>
          </div>
        </footer>
      </article>

      <div className="no-print mx-auto max-w-[8.5in] px-2 py-4 text-center text-xs text-slate-500">{t("pages.competitorComparison.printTip")}<strong>{t("pages.competitorComparison.letter")}</strong> with{" "}
        <strong>{t("pages.competitorComparison.defaultMargins")}</strong> and <strong>{t("pages.competitorComparison.backgroundGraphics")}</strong>{t("pages.competitorComparison.keepColors")}</div>
    </>
  );
}
