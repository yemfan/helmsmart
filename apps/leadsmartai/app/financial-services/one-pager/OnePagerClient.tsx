"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Network,
  Printer,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getFinancialServicesTheme } from "@/lib/financial-services/theme";

/**
 * Executive one-pager for forwarding to GFI leadership.
 *
 * Designed for single-page browser-print-to-PDF. Open the URL, click "Save as PDF",
 * pick "Letter" or "A4" with default margins. Brand colors are preserved via
 * `print-color-adjust: exact`.
 *
 * Shareable URL: /financial-services/one-pager?print=1 auto-opens the print dialog.
 */
export default function OnePagerClient() {
  const theme = getFinancialServicesTheme();
  const params = useSearchParams();

  useEffect(() => {
    if (params?.get("print") === "1") {
      setTimeout(() => window.print(), 400);
    }
  }, [params]);

  const partnerLabel = theme.partnerName || "Financial Services";
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: Letter;
            margin: 0.4in 0.5in;
          }
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .print-page {
            box-shadow: none !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        @media screen {
          body { background: #f1f5f9; }
        }
      `}</style>

      {/* Toolbar (screen only) */}
      <div className="no-print mx-auto flex max-w-[8.5in] items-center justify-between gap-3 px-2 pt-6 pb-3">
        <p className="text-sm text-slate-600">
          Executive brief — optimized for print or save-as-PDF.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" />
          Save as PDF
        </button>
      </div>

      <article
        className="print-page mx-auto my-4 max-w-[8.5in] overflow-hidden bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200/60"
        style={{ minHeight: "10.6in" }}
      >
        {/* Hero band — GFI brand */}
        <header className={`${theme.heroBg} relative px-10 py-7 text-white`}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
                Executive brief · {today}
              </p>
              <h1 className="mt-1 text-[26pt] font-semibold leading-[1.05] tracking-tight">
                LeadSmart&nbsp;AI for{" "}
                <span className={theme.accentText}>{partnerLabel}</span>
              </h1>
              <p className="mt-2 max-w-[5in] text-[11pt] leading-snug text-white/85">
                Purpose-built AI workspace for the way MLM financial-services
                agencies actually grow — recruit, nurture, sit, close.
              </p>
            </div>
            <div className="hidden text-right text-[9pt] leading-tight text-white/70 sm:block">
              <p className="font-semibold uppercase tracking-wider text-white/80">
                Prepared for
              </p>
              <p className="mt-0.5">{partnerLabel} Leadership</p>
            </div>
          </div>
          {/* Accent bar */}
          <div
            className={`absolute inset-x-0 bottom-0 h-1.5 ${
              theme.partnerName === "GFI"
                ? "bg-amber-400"
                : theme.partnerName === "WFG"
                  ? "bg-red-500"
                  : theme.partnerName === "PFO"
                    ? "bg-emerald-400"
                    : "bg-indigo-400"
            }`}
          />
        </header>

        {/* Body */}
        <section className="px-10 py-6 text-[10.5pt] leading-[1.55] text-slate-800">
          {/* Problem framing */}
          <p>
            <strong className="text-slate-900">{partnerLabel} grows by recruiting and retaining producers who can sit, close, and bring back the next recruit.</strong>{" "}
            That cycle has two universal bottlenecks: producers respond to
            inbound prospects too slowly, and assembling a polished Financial
            Needs Analysis takes hours instead of minutes. New producers feel
            both bottlenecks the most — and most of them quit before their first
            issued policy. LeadSmart AI was built to fix those two specific
            bottlenecks first, then expand from there.
          </p>

          {/* What it does — 4 cards in 2x2 */}
          <h2 className="mt-5 text-[11pt] font-semibold uppercase tracking-wider text-slate-500">
            What the platform does today
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <FeatureCard
              icon={Bot}
              title="AI nurture in under 5 minutes"
              body="Every inbound prospect gets an SMS or email reply within minutes, in the producer's voice, with state-appropriate disclosures auto-appended."
              accentBg={
                theme.partnerName === "GFI" ? "bg-amber-50" : "bg-indigo-50"
              }
              accentText={
                theme.partnerName === "GFI" ? "text-amber-700" : "text-indigo-700"
              }
            />
            <FeatureCard
              icon={Sparkles}
              title="Financial Needs Analysis in 60 seconds"
              body="Producer types in client facts → polished, agent-branded FNA with DIME, retirement gap, and coverage recommendation, ready for the kitchen-table sit."
              accentBg={
                theme.partnerName === "GFI" ? "bg-amber-50" : "bg-indigo-50"
              }
              accentText={
                theme.partnerName === "GFI" ? "text-amber-700" : "text-indigo-700"
              }
            />
            <FeatureCard
              icon={Network}
              title="Recruit pipeline + downline view"
              body="Interest → BPM → License → First Sale → Promotion, with hierarchy and recruit-fit scoring built in — MDs see their downline without a spreadsheet."
              accentBg={
                theme.partnerName === "GFI" ? "bg-amber-50" : "bg-indigo-50"
              }
              accentText={
                theme.partnerName === "GFI" ? "text-amber-700" : "text-indigo-700"
              }
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Compliance-aware by design"
              body="TCPA opt-in audit · supervised review queue for AI drafts · state-disclosure injection · audit-ready communications archive."
              accentBg={
                theme.partnerName === "GFI" ? "bg-amber-50" : "bg-indigo-50"
              }
              accentText={
                theme.partnerName === "GFI" ? "text-amber-700" : "text-indigo-700"
              }
            />
          </div>

          {/* Metrics + Pilot side-by-side */}
          <div className="mt-5 grid grid-cols-5 gap-4">
            <div className="col-span-3">
              <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">
                The four numbers we expect to move
              </h2>
              <table className="mt-2 w-full border-collapse text-[9.5pt]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[8.5pt] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-1.5">Metric</th>
                    <th className="py-1.5">Baseline</th>
                    <th className="py-1.5 text-right">Pilot target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <MetricRow
                    metric="Speed-to-lead"
                    baseline="Hours to days"
                    target="Under 5 minutes"
                  />
                  <MetricRow
                    metric="FNAs per producer / month"
                    baseline="1–2"
                    target="4+"
                  />
                  <MetricRow
                    metric="Recruit interest → licensed (60d)"
                    baseline="25–35%"
                    target="+10pp lift"
                  />
                  <MetricRow
                    metric="Premium submitted (new producer, 60d)"
                    baseline="Varies"
                    target="2× cohort baseline"
                  />
                </tbody>
              </table>
              <p className="mt-1.5 text-[8.5pt] italic text-slate-500">
                We measure against {partnerLabel}&apos;s actual baselines, not
                industry averages.
              </p>
            </div>

            <div className="col-span-2">
              <div
                className={`h-full rounded-xl border ${
                  theme.partnerName === "GFI"
                    ? "border-amber-300 bg-amber-50"
                    : "border-indigo-200 bg-indigo-50"
                } p-3.5`}
              >
                <p
                  className={`text-[8.5pt] font-semibold uppercase tracking-wider ${
                    theme.partnerName === "GFI"
                      ? "text-amber-800"
                      : "text-indigo-800"
                  }`}
                >
                  90-day pilot · zero cost
                </p>
                <p className="mt-1.5 text-[9.5pt] font-semibold text-slate-900">
                  One MD&apos;s team, 10–25 producers.
                </p>
                <ul className="mt-2 space-y-1.5 text-[9pt] leading-[1.4] text-slate-700">
                  <PilotPoint>Platform free for 90 days</PilotPoint>
                  <PilotPoint>Compliance review of templates wk 1</PilotPoint>
                  <PilotPoint>Weekly metric reads with the MD</PilotPoint>
                  <PilotPoint>
                    Day 90 decision: <strong>expand · extend · exit</strong>
                  </PilotPoint>
                  <PilotPoint>No contracts, no setup fees</PilotPoint>
                </ul>
              </div>
            </div>
          </div>

          {/* What we're not */}
          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-[9.5pt] leading-snug text-slate-700 ring-1 ring-slate-200">
            <p>
              <strong className="text-slate-900">What we&apos;re not.</strong>{" "}
              We don&apos;t replace TransACT, WinFlex, iPipeline, or any carrier
              tool — producers keep those for illustrations, e-application, and
              policy administration. LeadSmart AI handles the pre-sale and
              recruiting layer that no carrier tool addresses. We don&apos;t ask
              for exclusivity in the pilot. {partnerLabel} owns the data,
              exportable in one click.
            </p>
          </div>

          {/* Why us / why now */}
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div>
              <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">
                Why us, why now
              </h2>
              <p className="mt-2 text-[9.5pt] leading-snug text-slate-700">
                The underlying LeadSmart AI platform powers{" "}
                <strong>3,400+ active producers</strong> in adjacent verticals
                (real estate, mortgage). AI, CRM, billing, and compliance
                infrastructure are battle-tested at scale. The financial-services
                vertical layer is new — purpose-built for IUL, annuity, term
                life, and MLM hierarchy from day one. {partnerLabel} as the
                first agency to help shape it means the product gets built
                around your workflow and your compliance posture.
              </p>
            </div>
            <div>
              <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">
                The next step
              </h2>
              <p className="mt-2 text-[9.5pt] leading-snug text-slate-700">
                A 30-minute working session with one of your MDs and one of
                your producers. We show the live workspace, you ask the hard
                questions, and we decide together if a pilot fits.{" "}
                <strong>No deck, no slideware, no pressure.</strong>
              </p>
              <div
                className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9pt] font-semibold text-white ${
                  theme.partnerName === "GFI"
                    ? "bg-blue-900"
                    : "bg-indigo-700"
                }`}
              >
                Schedule the working session{" "}
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </section>

        {/* Footer / signature */}
        <footer className="mt-auto border-t border-slate-100 bg-slate-50 px-10 py-3.5 text-[8.5pt] text-slate-600">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">
                [Your name], LeadSmart AI
              </p>
              <p>[Your contact email] · realtybossai.com</p>
            </div>
            <p className="text-right text-[7.5pt] text-slate-400">
              Confidential — prepared exclusively for {partnerLabel}{" "}
              leadership.
            </p>
          </div>
        </footer>
      </article>

      <div className="no-print mx-auto max-w-[8.5in] px-2 py-4 text-center text-xs text-slate-500">
        Tip: in the print dialog, choose <strong>Letter</strong> size with{" "}
        <strong>default margins</strong> for best fit. Make sure{" "}
        <strong>Background graphics</strong> is enabled to keep brand colors.
      </div>
    </>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  accentBg,
  accentText,
}: {
  icon: typeof Bot;
  title: string;
  body: string;
  accentBg: string;
  accentText: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accentBg}`}
      >
        <Icon className={`h-4 w-4 ${accentText}`} />
      </span>
      <div>
        <p className="text-[10pt] font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-[9pt] leading-snug text-slate-600">{body}</p>
      </div>
    </div>
  );
}

function MetricRow({
  metric,
  baseline,
  target,
}: {
  metric: string;
  baseline: string;
  target: string;
}) {
  return (
    <tr>
      <td className="py-1.5 font-medium text-slate-800">{metric}</td>
      <td className="py-1.5 text-slate-500">{baseline}</td>
      <td className="py-1.5 text-right font-semibold tabular-nums text-slate-900">
        {target}
      </td>
    </tr>
  );
}

function PilotPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}
