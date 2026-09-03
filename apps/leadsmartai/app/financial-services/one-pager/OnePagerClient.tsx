"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import { intlLocale } from "@/lib/i18n/locale";

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
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const theme = getFinancialServicesTheme();
  const params = useSearchParams();

  useEffect(() => {
    if (params?.get("print") === "1") {
      setTimeout(() => window.print(), 400);
    }
  }, [params]);

  const partnerLabel = theme.partnerName || "Financial Services";
  const today = new Date().toLocaleDateString(locale, {
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
        <p className="text-sm text-slate-600">{t("pages.fsMarketing.execBrief")}</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" />{t("pages.fsMarketing.saveAsPdf")}</button>
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
              <h1 className="mt-1 text-[26pt] font-semibold leading-[1.05] tracking-tight">{t("pages.fsMarketing.forPartner")}{" "}
                <span className={theme.accentText}>{partnerLabel}</span>
              </h1>
              <p className="mt-2 max-w-[5in] text-[11pt] leading-snug text-white/85">{t("pages.fsMarketing.purposeBuilt")}</p>
            </div>
            <div className="hidden text-right text-[9pt] leading-tight text-white/70 sm:block">
              <p className="font-semibold uppercase tracking-wider text-white/80">{t("pages.fsMarketing.preparedFor")}</p>
              <p className="mt-0.5">{partnerLabel} {t("pages.fsMarketing.leadership")}</p>
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
            <strong className="text-slate-900">{partnerLabel} {t("pages.fsMarketing.growsBy")}</strong>{" "}{t("pages.fsMarketing.bottlenecks")}</p>

          {/* What it does — 4 cards in 2x2 */}
          <h2 className="mt-5 text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.fsMarketing.whatItDoes")}</h2>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <FeatureCard
              icon={Bot}
              title={t("pages.fsMarketing.nurture5")}
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
              title={t("pages.fsMarketing.fna60")}
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
              title={t("pages.fsMarketing.recruitDownline")}
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
              title={t("pages.fsMarketing.complianceAware")}
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
              <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.fsMarketing.fourNumbers")}</h2>
              <table className="mt-2 w-full border-collapse text-[9.5pt]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[8.5pt] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-1.5">{t("pages.fsMarketing.metric")}</th>
                    <th className="py-1.5">{t("pages.fsMarketing.baseline")}</th>
                    <th className="py-1.5 text-right">{t("pages.fsMarketing.pilotTarget")}</th>
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
              <p className="mt-1.5 text-[8.5pt] italic text-slate-500">{t("pages.fsMarketing.measureAgainst")} {partnerLabel}{t("pages.fsMarketing.actualBaselines")}</p>
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
                <p className="mt-1.5 text-[9.5pt] font-semibold text-slate-900">{t("pages.fsMarketing.oneMdTeam")}</p>
                <ul className="mt-2 space-y-1.5 text-[9pt] leading-[1.4] text-slate-700">
                  <PilotPoint>{t("pages.fsMarketing.freeFor90")}</PilotPoint>
                  <PilotPoint>{t("pages.fsMarketing.complianceWk1")}</PilotPoint>
                  <PilotPoint>{t("pages.fsMarketing.weeklyReads")}</PilotPoint>
                  <PilotPoint>{t("pages.fsMarketing.day90Decision")}<strong>expand · extend · exit</strong>
                  </PilotPoint>
                  <PilotPoint>{t("pages.fsMarketing.noContracts")}</PilotPoint>
                </ul>
              </div>
            </div>
          </div>

          {/* What we're not */}
          <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-[9.5pt] leading-snug text-slate-700 ring-1 ring-slate-200">
            <p>
              <strong className="text-slate-900">{t("pages.fsMarketing.whatWereNot")}</strong>{" "}{t("pages.fsMarketing.noReplace")} {partnerLabel} {t("pages.fsMarketing.ownsData")}</p>
          </div>

          {/* Why us / why now */}
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div>
              <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.fsMarketing.whyUsWhyNow")}</h2>
              <p className="mt-2 text-[9.5pt] leading-snug text-slate-700">{t("pages.fsMarketing.platformPowers")}{" "}
                <strong>{t("pages.fsMarketing.activeProducers")}</strong> {t("pages.fsMarketing.adjacentVerticals")} {partnerLabel} {t("pages.fsMarketing.firstAgency")}</p>
            </div>
            <div>
              <h2 className="text-[11pt] font-semibold uppercase tracking-wider text-slate-500">{t("pages.fsMarketing.nextStep")}</h2>
              <p className="mt-2 text-[9.5pt] leading-snug text-slate-700">{t("pages.fsMarketing.workingSession")}{" "}
                <strong>{t("pages.fsMarketing.noDeck")}</strong>
              </p>
              <div
                className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9pt] font-semibold text-white ${
                  theme.partnerName === "GFI"
                    ? "bg-blue-900"
                    : "bg-indigo-700"
                }`}
              >{t("pages.fsMarketing.scheduleSession")}{" "}
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
                [Your name], CloseBoss AI
              </p>
              <p>[Your contact email] · closebossai.com</p>
            </div>
            <p className="text-right text-[7.5pt] text-slate-400">{t("pages.fsMarketing.confidentialFor")} {partnerLabel}{" "}{t("pages.fsMarketing.leadershipSuffix")}</p>
          </div>
        </footer>
      </article>

      <div className="no-print mx-auto max-w-[8.5in] px-2 py-4 text-center text-xs text-slate-500">{t("pages.fsMarketing.printTip")}<strong>{t("pages.fsMarketing.letter")}</strong> {t("pages.fsMarketing.sizeWith")}{" "}
        <strong>{t("pages.fsMarketing.defaultMargins")}</strong> {t("pages.fsMarketing.forBestFit")}{" "}
        <strong>{t("pages.fsMarketing.backgroundGraphics")}</strong>{t("pages.fsMarketing.keepBrandColors")}</div>
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
