"use client";

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { getFinancialServicesTheme } from "@/lib/financial-services/theme";
import { useTranslation } from "react-i18next";

type Plan = {
  key: "pilot" | "producer" | "agency" | "enterprise";
  name: string;
  price: string;
  priceSubtext: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    key: "pilot",
    name: "Pilot cohort",
    price: "Free",
    priceSubtext: "90 days, up to 25 producers",
    description: "For first-mover agencies running a structured 60–90 day pilot.",
    features: [
      "Full platform access for cohort",
      "Compliance review of templates",
      "Direct founder Slack channel",
      "Weekly metric reports",
      "One vertical-specific feature shipped per month",
    ],
    cta: "Talk to founder",
    href: "/support",
  },
  {
    key: "producer",
    name: "Producer",
    price: "$49",
    priceSubtext: "/producer/month",
    description: "Individual producers — full AI nurture + FNA + appointment tools.",
    features: [
      "AI SMS, email, and voice nurture",
      "Unlimited FNAs",
      "Lead capture funnels + scoring",
      "Calendar booking + reminders",
      "Compliance-reviewed templates",
    ],
    cta: "Start free trial",
    href: "/start-free/agent",
  },
  {
    key: "agency",
    name: "Agency",
    price: "$39",
    priceSubtext: "/producer/month · 10+ seats",
    description: "MDs and uplines — adds recruit pipeline, downline view, and team analytics.",
    features: [
      "Everything in Producer",
      "Recruit pipeline + downline view",
      "Hierarchical reporting (KPIs by upline)",
      "BPM event tooling + post-event nurture",
      "Multi-language AI (Spanish + Mandarin day-one)",
      "Bulk template approval workflow",
    ],
    cta: "Talk to sales",
    href: "/support",
    featured: true,
  },
  {
    key: "enterprise",
    name: "Enterprise / IMO",
    price: "Custom",
    priceSubtext: "Multi-agency, white-label options",
    description: "For IMOs and multi-agency platforms (Transamerica-affiliated and similar).",
    features: [
      "Everything in Agency",
      "White-label option (your brand, your domain)",
      "Carrier integrations (WinFlex, iPipeline)",
      "NIPR license sync",
      "Smarsh/Global Relay archive integration",
      "Dedicated success engineer",
      "Custom commission/override accounting",
    ],
    cta: "Schedule discovery call",
    href: "/support",
  },
];

export default function FinancialServicesPricingClient() {
  const { t } = useTranslation("dashboard");
  const theme = getFinancialServicesTheme();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <Link
            href="/financial-services"
            className="text-sm font-semibold tracking-tight text-slate-900"
          >
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
            <Link href="/financial-services" className="hover:text-slate-900">{t("pages.fsMarketing.overview")}</Link>
            <Link
              href="/financial-services/dashboard"
              className="hover:text-slate-900"
            >{t("pages.fsMarketing.demoDashboard")}</Link>
          </nav>
        </div>
      </header>

      <section className="px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">
            <Sparkles className="h-3.5 w-3.5" />{t("pages.fsMarketing.perProducer")}</span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">{t("pages.fsMarketing.builtForAgencies")}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">{t("pages.fsMarketing.pricingSub")}</p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-5 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <article
              key={plan.key}
              className={[
                "flex flex-col rounded-2xl border bg-white p-6 shadow-sm",
                plan.featured
                  ? "border-slate-900 shadow-lg ring-1 ring-slate-900"
                  : "border-slate-200",
              ].join(" ")}
            >
              <header>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {plan.name}
                  </h2>
                  {plan.featured && (
                    <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">{t("pages.fsMarketing.mostPopular")}</span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <p className="text-3xl font-semibold tracking-tight text-slate-900">
                    {plan.price}
                  </p>
                </div>
                <p className="text-xs text-slate-500">{plan.priceSubtext}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {plan.description}
                </p>
              </header>

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm leading-6 text-slate-700"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={[
                  "mt-6 inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition",
                  plan.featured
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
                ].join(" ")}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-600">
          <p className="font-semibold text-slate-900">{t("pages.fsMarketing.includedEveryTier")}</p>
          <p className="mt-2">
            {t("pages.fsMarketing.includedFeatureList")}
          </p>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-slate-500">{t("pages.fsMarketing.pricingIllustrative")}</p>
      </section>
    </main>
  );
}
