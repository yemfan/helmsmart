import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  FileText,
  Network,
  Shield,
  Sparkles,
  Timer,
  Users,
} from "lucide-react";
import { getFinancialServicesTheme } from "@/lib/financial-services/theme";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "LeadSmart AI for Financial Services Agencies",
  description:
    "AI lead nurture, recruit pipeline, and instant Financial Needs Analysis — purpose-built for IUL, annuity, and term life producers. Demo-ready for GFI, WFG, and Transamerica-affiliated agencies.",
  keywords: [
    "financial services CRM",
    "IUL CRM",
    "annuity CRM",
    "MLM insurance",
    "WFG",
    "GFI",
    "Global Financial Impact",
    "World Financial Group",
    "recruit pipeline",
    "Financial Needs Analysis",
    "FNA",
  ],
};

const KPI_BAR = [
  { label: "Speed-to-lead", value: "< 5 min", hint: "From inbound to first contact, automated." },
  { label: "FNAs generated", value: "60 seconds", hint: "AI-built, agent-branded, client-ready." },
  { label: "Recruit conversion", value: "+10pp lift", hint: "Pilot target vs. industry baseline." },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI Financial Needs Analysis",
    body: "Your producer inputs prospect facts; we return a 12-page agent-branded FNA in under a minute. DIME calculation, retirement gap, coverage recommendation, plain-English narrative.",
  },
  {
    icon: Bot,
    title: "AI SMS, email, and voice nurture",
    body: "Insurance-flavored templates. Compliant disclosures auto-appended by state and product. Inbound replies handled 24/7. Bilingual ready.",
  },
  {
    icon: Network,
    title: "Recruit pipeline + downline view",
    body: "Track recruits from Initial Interest → BPM → License → First Sale → Promotion. Every upline sees their team's pipeline. Override-ready.",
  },
  {
    icon: CalendarClock,
    title: "Kitchen-table appointment flow",
    body: "Lead capture → auto-booked appt → reminder cadence → post-appt follow-up. The producer just shows up and presents.",
  },
  {
    icon: Shield,
    title: "Compliance-aware by design",
    body: "TCPA opt-in audit, supervised review queue for AI-drafted comms, state-disclosure injection, audit-ready communications archive.",
  },
  {
    icon: BarChart3,
    title: "Producer + upline KPIs",
    body: "Speed-to-lead, FNAs/month, appts set, premium submitted, recruit conversion. Roll-up by hierarchy — every SMD sees their downline.",
  },
];

const COMPARISON = [
  { stack: "Carrier portals + Excel + WhatsApp", limit: "No unified view, slow follow-up, zero AI assist." },
  { stack: "AgencyBloc / Redtail / Salesforce FSC", limit: "Built for traditional independent agents — no recruit hierarchy, no AI nurture out of the box." },
  { stack: "Generic CRMs (HubSpot, GHL)", limit: "Not insurance-aware, no FNA, no state disclosures, no MLM hierarchy." },
  { stack: "LeadSmart AI · Financial Services", limit: "✓ All of the above, designed for agency leaders and producers — together." },
];

const HOW_IT_WORKS = [
  { num: "01", title: "Capture", body: "Public-facing lead funnels: Free Retirement Roadmap, Life Insurance Quote, Debt-Free Plan." },
  { num: "02", title: "Qualify", body: "AI SMS/email kicks off within 5 minutes. Lead score + product-fit tag attached." },
  { num: "03", title: "Convert", body: "Auto-booked kitchen-table appt. AI generates FNA the producer can present from minute one." },
  { num: "04", title: "Retain & multiply", body: "Annual review automation, policy anniversary nudges — and a parallel recruit pipeline for downline growth." },
];

const FAQ = [
  {
    q: "How is this different from the carrier's own tools?",
    a: "Carrier tools assume the agent already has the prospect ready to apply. LeadSmart AI fills the gap before the application — finding leads, nurturing them, qualifying them, and producing the FNA that drives the kitchen-table sit.",
  },
  {
    q: "Will it work with Transamerica / our carriers?",
    a: "Yes. LeadSmart AI sits beside, not inside, the carrier portals. Producers continue using carrier portals for illustrations, e-app, and policy management. We add the pre-sale and recruiting layer that carriers don't provide.",
  },
  {
    q: "What about compliance and supervision?",
    a: "Every outbound AI message can be queued for principal/OSJ review before send. Communications are stored in an audit-ready archive. State-specific disclosures auto-append by product and jurisdiction.",
  },
  {
    q: "How fast can a pilot go live?",
    a: "Two weeks from agreement to live cohort. Week 1: compliance template review + onboarding. Week 2: pilot agents go live with their first AI nurtures.",
  },
];

export default async function FinancialServicesLandingPage() {
  const t = await getServerT();
  const theme = getFinancialServicesTheme();

  return (
    <main className="min-h-screen bg-white">
      {/* Top bar with theming hook */}
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-slate-900">
            {theme.partnerName ? (
              <span>
                <span className="text-slate-500">LeadSmart AI ×</span>{" "}
                <span className={theme.accentText}>{theme.partnerName}</span>
              </span>
            ) : (
              "LeadSmart AI"
            )}
          </Link>
          <nav className="hidden gap-6 text-sm text-slate-600 md:flex">
            <a href="#how" className="hover:text-slate-900">{t("pages.fsMarketing.howItWorks", { ns: "dashboard" })}</a>
            <a href="#features" className="hover:text-slate-900">{t("pages.fsMarketing.features", { ns: "dashboard" })}</a>
            <a href="#compare" className="hover:text-slate-900">{t("pages.fsMarketing.whyUs", { ns: "dashboard" })}</a>
            <Link href="/financial-services/pricing" className="hover:text-slate-900">{t("pages.fsMarketing.pricing", { ns: "dashboard" })}</Link>
          </nav>
          <Link
            href="/login?redirect=/financial-services/dashboard"
            className={`hidden rounded-full px-4 py-2 text-sm font-semibold text-white md:inline-flex ${theme.ctaBg}`}
          >{t("pages.fsMarketing.signIn", { ns: "dashboard" })}</Link>
        </div>
      </header>

      {/* Hero */}
      <section className={`relative overflow-hidden ${theme.heroBg}`}>
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              {theme.partnerName && (
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Built for {theme.partnerName} producers
                </div>
              )}
              <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl">
                The AI platform built for{" "}
                <span className={theme.accentText}>{t("pages.fsMarketing.heroTail", { ns: "dashboard" })}</span> — not real estate, not retail.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-7 text-white/80">{t("pages.fsMarketing.heroSub", { ns: "dashboard" })}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/financial-services/dashboard"
                  className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 ${theme.ctaBg}`}
                >{t("pages.fsMarketing.seeDemo", { ns: "dashboard" })}<ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10"
                >{t("pages.fsMarketing.howItWorks", { ns: "dashboard" })}</a>
              </div>
              <p className="mt-4 text-xs text-white/60">{t("pages.fsMarketing.pilotReady", { ns: "dashboard" })}</p>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">{t("pages.fsMarketing.benchmarks", { ns: "dashboard" })}</p>
                <div className="mt-3 space-y-4">
                  {KPI_BAR.map((kpi) => (
                    <div key={kpi.label} className="border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium text-white/80">{kpi.label}</span>
                        <span className="text-2xl font-semibold text-white">{kpi.value}</span>
                      </div>
                      <p className="mt-1 text-xs text-white/60">{kpi.hint}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{t("pages.fsMarketing.inboundToIssued", { ns: "dashboard" })}</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{t("pages.fsMarketing.designedAround", { ns: "dashboard" })}</p>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.num} className="rounded-2xl border border-slate-200 bg-white p-6">
                <p className={`text-xs font-semibold ${theme.accentText}`}>{step.num}</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{t("pages.fsMarketing.everyTool", { ns: "dashboard" })}</h2>
            <p className="mt-3 text-base leading-7 text-slate-600">{t("pages.fsMarketing.builtDayOne", { ns: "dashboard" })}</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm">
                <f.icon className={`h-6 w-6 ${theme.accentIcon}`} />
                <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{t("pages.fsMarketing.todayVsNeed", { ns: "dashboard" })}</h2>
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-5 py-3">{t("pages.fsMarketing.todaysStack", { ns: "dashboard" })}</th>
                  <th className="px-5 py-3">{t("pages.fsMarketing.fallsShort", { ns: "dashboard" })}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COMPARISON.map((row, i) => (
                  <tr key={i} className={i === COMPARISON.length - 1 ? "bg-emerald-50/40" : ""}>
                    <td className="px-5 py-4 font-medium text-slate-900">{row.stack}</td>
                    <td className="px-5 py-4 text-slate-700">{row.limit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pilot proof */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{t("pages.fsMarketing.lowRiskPilot", { ns: "dashboard" })}</h2>
              <p className="mt-3 text-base leading-7 text-slate-600">{t("pages.fsMarketing.pilotProposal", { ns: "dashboard" })}</p>
              <ul className="mt-6 space-y-3">
                {[
                  "Platform free for the pilot cohort for 90 days",
                  "Compliance review of all AI templates before launch",
                  "Direct founder Slack channel with the MD",
                  "Baseline metrics shared; we measure against your numbers",
                  "Anonymized case study post-pilot — no obligation",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                    <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${theme.accentIcon}`} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
              <div className="flex items-center gap-3">
                <Timer className={`h-5 w-5 ${theme.accentIcon}`} />
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.fsMarketing.pilotTimeline", { ns: "dashboard" })}</p>
              </div>
              <div className="mt-6 space-y-5 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">Week 0 · Agreement + scope</p>
                  <p className="text-slate-600">{t("pages.fsMarketing.pilotStep1", { ns: "dashboard" })}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Week 1–2 · Compliance + onboarding</p>
                  <p className="text-slate-600">{t("pages.fsMarketing.pilotStep2", { ns: "dashboard" })}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Week 3–8 · Active pilot</p>
                  <p className="text-slate-600">{t("pages.fsMarketing.pilotStep3", { ns: "dashboard" })}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Week 9–12 · Measurement + decision</p>
                  <p className="text-slate-600">{t("pages.fsMarketing.pilotStep4", { ns: "dashboard" })}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{t("pages.fsMarketing.commonQuestions", { ns: "dashboard" })}</h2>
          <div className="mt-10 space-y-6">
            {FAQ.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-slate-200 bg-white p-6">
                <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">
                  {item.q}
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className={`${theme.heroBg}`}>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{t("pages.fsMarketing.readyToSee", { ns: "dashboard" })}</h2>
          <p className="mt-4 text-base leading-7 text-white/80">{t("pages.fsMarketing.walkthrough", { ns: "dashboard" })}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/financial-services/dashboard"
              className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 ${theme.ctaBg}`}
            >{t("pages.fsMarketing.openDemo", { ns: "dashboard" })}<ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10"
            >{t("pages.fsMarketing.talkFounder", { ns: "dashboard" })}</Link>
          </div>
        </div>
      </section>

      <footer className="bg-slate-900 py-8 text-center text-xs text-white/60">
        © LeadSmart AI · Built for financial services agencies. Pilot inquiries welcome.
      </footer>

      <DemoIconsKeepBundle />
    </main>
  );
}

/* Touch unused icons so tree-shaking keeps them available for theming swaps. */
function DemoIconsKeepBundle() {
  void [FileText, Users];
  return null;
}
