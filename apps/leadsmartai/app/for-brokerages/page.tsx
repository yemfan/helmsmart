import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  Flag,
  GitBranch,
  Headphones,
  LayoutDashboard,
  Network,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const tb = (key: string): string => t(key, { ns: "web_for_brokerages" });
  return {
    title: tb("meta.title"),
    description: tb("meta.description"),
    keywords: [
      "real estate brokerage software",
      "brokerage CRM",
      "real estate broker dashboard",
      "agent performance tracking",
      "agent retention",
      "brokerage operating system",
      "kvCORE alternative",
      "Follow Up Boss alternative",
      "Chime alternative",
    ],
  };
}

const KPI_KEYS = ["speed_to_lead", "conversion", "under_producer", "retention"] as const;
const KPI_VALUES: Record<(typeof KPI_KEYS)[number], string> = {
  speed_to_lead: "< 5 min",
  conversion: "+50%",
  under_producer: "−15pp",
  retention: "+10pp",
};

const BROKER_FEATURE_KEYS: Array<{ key: string; icon: LucideIcon }> = [
  { key: "command_center", icon: LayoutDashboard },
  { key: "leaderboard", icon: Trophy },
  { key: "fitness_flags", icon: Flag },
  { key: "distribution", icon: GitBranch },
  { key: "recruiting", icon: Network },
  { key: "compliance", icon: ShieldCheck },
];

const AGENT_FEATURE_KEYS: Array<{ key: string; icon: LucideIcon }> = [
  { key: "nurture", icon: Bot },
  { key: "cma", icon: Sparkles },
  { key: "funnel", icon: TrendingUp },
  { key: "calendar", icon: CalendarClock },
];

const COMPARISON_KEYS = [
  "kvcore",
  "fub",
  "chime",
  "boomtown",
  "spreadsheets",
  "realtyboss",
] as const;

const HOW_KEYS = ["capture", "nurture", "convert", "retain"] as const;
const HOW_NUMS: Record<(typeof HOW_KEYS)[number], string> = {
  capture: "01",
  nurture: "02",
  convert: "03",
  retain: "04",
};

const FAQ_KEYS = ["vs_kvcore", "adoption", "migration", "scale", "pricing_catch"] as const;

const PRICING_KEYS: Array<{ key: string; featured?: boolean }> = [
  { key: "pilot" },
  { key: "popular", featured: true },
  { key: "volume" },
];

export default async function ForBrokeragesPage() {
  const t = await getServerT();
  const tb = (key: string): string => t(key, { ns: "web_for_brokerages" });

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
            <Building2 className="h-5 w-5 text-slate-700" />
            CloseBoss <span className="text-slate-400">·</span>{" "}
            <span className="text-slate-600">{tb("header.brand_suffix")}</span>
          </Link>
          <nav className="hidden gap-6 text-sm text-slate-600 md:flex">
            <a href="#how" className="hover:text-slate-900">{tb("header.nav_how")}</a>
            <a href="#features" className="hover:text-slate-900">{tb("header.nav_features")}</a>
            <a href="#compare" className="hover:text-slate-900">{tb("header.nav_why")}</a>
            <a href="#pricing" className="hover:text-slate-900">{tb("header.nav_pricing")}</a>
          </nav>
          <a
            href="#book"
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {tb("header.book")}
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                <Building2 className="h-3.5 w-3.5" />
                {tb("hero.badge")}
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl">
                {tb("hero.h1_lead")} <span className="text-amber-300">{tb("hero.h1_highlight")}</span>{" "}
                {tb("hero.h1_tail")}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-7 text-white/80">
                {tb("hero.body")}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#book"
                  className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-black/20 hover:bg-amber-300"
                >
                  {tb("hero.cta_primary")} <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10"
                >
                  {tb("hero.cta_secondary")}
                </a>
              </div>
              <p className="mt-4 text-xs text-white/60">
                {tb("hero.reassurance")}
              </p>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                  {tb("hero.kpi_title")}
                </p>
                <div className="mt-3 space-y-4">
                  {KPI_KEYS.map((k) => (
                    <div key={k} className="border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium text-white/80">{tb(`kpis.${k}.label`)}</span>
                        <span className="text-2xl font-semibold text-amber-300">{KPI_VALUES[k]}</span>
                      </div>
                      <p className="mt-1 text-xs text-white/60">{tb(`kpis.${k}.hint`)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The adoption problem — the six-figures-unused-CRM story */}
      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
                {tb("problem.eyebrow")}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                {tb("problem.h2")}
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">{tb("problem.body1")}</p>
              <p className="mt-4 text-base leading-7 text-slate-600">{tb("problem.body2")}</p>
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                <p className="text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
                  {tb("problem.stat_value")}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{tb("problem.stat_label")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            {tb("how.h2")}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            {tb("how.subtitle")}
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {HOW_KEYS.map((step) => (
              <div key={step} className="rounded-2xl border border-slate-200 bg-white p-6">
                <p className="text-xs font-semibold text-amber-600">{HOW_NUMS[step]}</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{tb(`how.steps.${step}.title`)}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{tb(`how.steps.${step}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — Broker first */}
      <section id="features" className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">
              {tb("broker_features.eyebrow")}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              {tb("broker_features.h2")}
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              {tb("broker_features.subtitle")}
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {BROKER_FEATURE_KEYS.map((f) => (
              <div key={f.key} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm">
                <f.icon className="h-6 w-6 text-amber-600" />
                <h3 className="mt-4 text-base font-semibold text-slate-900">{tb(`broker_features.items.${f.key}.title`)}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{tb(`broker_features.items.${f.key}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — Agent (the mechanism) */}
      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {tb("agent_features.eyebrow")}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              {tb("agent_features.h2")}
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              {tb("agent_features.subtitle")}
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {AGENT_FEATURE_KEYS.map((f) => (
              <div key={f.key} className="rounded-2xl border border-slate-200 bg-white p-6">
                <f.icon className="h-6 w-6 text-blue-700" />
                <h3 className="mt-4 text-base font-semibold text-slate-900">{tb(`agent_features.items.${f.key}.title`)}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{tb(`agent_features.items.${f.key}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            {tb("comparison.h2")}
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            {tb("comparison.subtitle")}
          </p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-5 py-3">{tb("comparison.col_stack")}</th>
                  <th className="px-5 py-3">{tb("comparison.col_limit")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COMPARISON_KEYS.map((row, i) => (
                  <tr key={row} className={i === COMPARISON_KEYS.length - 1 ? "bg-amber-50/50" : ""}>
                    <td className="px-5 py-4 font-semibold text-slate-900">{tb(`comparison.rows.${row}.stack`)}</td>
                    <td className="px-5 py-4 text-slate-700">{tb(`comparison.rows.${row}.limit`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              {tb("pricing.h2")}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">
              {tb("pricing.subtitle")}
            </p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {PRICING_KEYS.map((p) => (
              <article
                key={p.key}
                className={[
                  "flex flex-col rounded-2xl border bg-white p-6",
                  p.featured ? "border-amber-400 shadow-lg ring-1 ring-amber-400" : "border-slate-200",
                ].join(" ")}
              >
                <header>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{tb(`pricing.tiers.${p.key}.tier`)}</h3>
                    <span
                      className={[
                        "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        p.featured ? "bg-amber-400 text-slate-900" : "bg-slate-100 text-slate-600",
                      ].join(" ")}
                    >
                      {tb(`pricing.tiers.${p.key}.note`)}
                    </span>
                  </div>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <p className="text-4xl font-semibold tracking-tight text-slate-900">{tb(`pricing.tiers.${p.key}.per_agent`)}</p>
                    <p className="text-sm text-slate-500">{tb("pricing.per_agent_period")}</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{tb(`pricing.tiers.${p.key}.description`)}</p>
                </header>
                <a
                  href="#book"
                  className={[
                    "mt-6 inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition",
                    p.featured
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {tb("pricing.cta")}
                </a>
              </article>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-slate-500">
            {tb("pricing.footnote")}
          </p>
        </div>
      </section>

      {/* Honesty section */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {tb("honesty.eyebrow")}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
                {tb("honesty.h2")}
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {tb("honesty.p1")}
              </p>
              <p className="mt-3 text-base leading-7 text-slate-600">
                {tb("honesty.p2")}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {tb("honesty.card_title")}
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span className="text-slate-700">
                    <strong className="text-slate-900">{tb("honesty.derisked_label")}</strong>{" "}
                    {tb("honesty.derisked_body")}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <span className="text-slate-700">
                    <strong className="text-slate-900">{tb("honesty.newer_label")}</strong>{" "}
                    {tb("honesty.newer_body")}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span className="text-slate-700">
                    <strong className="text-slate-900">{tb("honesty.mitigated_label")}</strong>{" "}
                    {tb("honesty.mitigated_body")}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            {tb("faq.h2")}
          </h2>
          <div className="mt-10 space-y-5">
            {FAQ_KEYS.map((item) => (
              <details key={item} className="group rounded-2xl border border-slate-200 bg-white p-6">
                <summary className="cursor-pointer list-none text-base font-semibold text-slate-900">
                  {tb(`faq.items.${item}.q`)}
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600">{tb(`faq.items.${item}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="book" className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6 md:py-20">
          <Headphones className="mx-auto h-10 w-10 text-amber-400" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            {tb("final_cta.h2")}
          </h2>
          <p className="mt-4 text-base leading-7 text-white/80">
            {tb("final_cta.body")}
          </p>
          <p className="mt-3 text-sm leading-7 text-white/60">
            {tb("final_cta.reassurance")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact?topic=brokerage-working-session"
              className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-black/20 hover:bg-amber-300"
            >
              {tb("final_cta.schedule")} <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="mailto:contact@closebossai.com?subject=Brokerage%20working%20session"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10"
            >
              {tb("final_cta.email_instead")}
            </a>
          </div>
        </div>
      </section>

      <footer className="bg-slate-950 py-8 text-center text-xs text-white/60">
        {tb("footer")}
      </footer>

      <KeepIconsBundled />
    </main>
  );
}

/* Touch unused icons so tree-shaking keeps them available for swaps. */
function KeepIconsBundled() {
  void [BarChart3, Briefcase, Timer, Users];
  return null;
}
