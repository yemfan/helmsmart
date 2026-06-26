import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import JsonLd from "@/components/JsonLd";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("about.title", { ns: "web_marketing" }),
    description: t("about.description", { ns: "web_marketing" }),
    alternates: { canonical: "/about" },
    openGraph: {
      title: t("about.og.title", { ns: "web_marketing" }),
      description: t("about.og.description", { ns: "web_marketing" }),
      url: "/about",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("about.twitter.title", { ns: "web_marketing" }),
      description: t("about.twitter.description", { ns: "web_marketing" }),
    },
  };
}

export default async function AboutLeadSmartAIPage() {
  const t = await getServerT();
  const ta = (key: string, opts?: Record<string, unknown>): string =>
    t(key, { ns: "web_about", ...opts });
  return (
    <main className="bg-white text-slate-900">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "RealtorBoss",
          description:
            "RealtorBoss helps real estate agents and financing professionals capture, qualify, and convert leads with AI — so they can spend less time chasing and more time closing. The AI growth engine for real estate professionals.",
          url: "https://realtybossai.com",
          logo: "https://realtybossai.com/logo.png",
          sameAs: [
            "https://twitter.com/leadsmart-ai",
            "https://linkedin.com/company/leadsmart-ai",
          ],
          contactPoint: {
            "@type": "ContactPoint",
            url: "https://realtybossai.com/contact",
            contactType: "Customer Service",
          },
        }}
      />
      {/* Hero */}
      <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
          <div className="max-w-4xl">
            <p className="mb-4 inline-flex rounded-full border border-slate-200/90 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.15em] text-slate-600 shadow-sm ring-1 ring-slate-900/[0.03]">
              {ta("hero.eyebrow")}
            </p>

            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              {ta("hero.h1")}
            </h1>

            <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600 md:text-xl">
              {ta("hero.subtitle")}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/signup">{ta("hero.cta_primary")}</Button>
              <Button href="/contact" variant="outline">
                {ta("hero.cta_secondary")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-2 md:items-start">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{ta("intro.headline_top")}</h2>
            <p className="mt-3 text-2xl font-semibold text-slate-900 md:text-3xl">{ta("intro.headline_bottom")}</p>
          </div>

          <div className="space-y-6 text-base leading-8 text-slate-600">
            <p>{ta("intro.p1")}</p>
            <p>{ta("intro.p2")}</p>
            <p>{ta("intro.p3")}</p>
          </div>
        </div>
      </section>

      {/* Value Cards */}
      <section className="bg-slate-50/80">
        <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">{ta("differentiator.h2")}</h2>
            <p className="mt-4 text-slate-600">{ta("differentiator.subtitle")}</p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {(["ai_qualification", "instant_follow_up", "workflow", "deal_visibility"] as const).map((cardKey) => (
              <Card key={cardKey} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
                <CardContent className="p-6">
                  <p className="text-sm font-medium uppercase tracking-widest text-slate-500">{ta(`differentiator.cards.${cardKey}.eyebrow`)}</p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight">{ta(`differentiator.cards.${cardKey}.title`)}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{ta(`differentiator.cards.${cardKey}.body`)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="rounded-3xl border border-rose-100/90 bg-gradient-to-br from-rose-50 to-white p-8 shadow-sm ring-1 ring-rose-900/[0.04]">
            <p className="text-sm font-medium uppercase tracking-widest text-rose-700">{ta("problem.eyebrow")}</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{ta("problem.h2")}</h2>
            <ul className="mt-6 space-y-4 text-slate-700">
              {(["slow_followup", "low_quality", "manual_workflows", "crm_logs_only"] as const).map((bulletKey) => (
                <li key={bulletKey} className="flex gap-2">
                  <span className="text-rose-500" aria-hidden>
                    •
                  </span>
                  <span>{ta(`problem.bullets.${bulletKey}`)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50 to-white p-8 shadow-sm ring-1 ring-emerald-900/[0.04]">
            <p className="text-sm font-medium uppercase tracking-widest text-emerald-700">{ta("solution.eyebrow")}</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{ta("solution.h2")}</h2>
            <ul className="mt-6 space-y-4 text-slate-700">
              {(["capture", "score", "ai_followup", "next_action"] as const).map((bulletKey) => (
                <li key={bulletKey} className="flex gap-2">
                  <span className="text-emerald-600" aria-hidden>
                    •
                  </span>
                  <span>{ta(`solution.bullets.${bulletKey}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-widest text-slate-400">{ta("workflow.eyebrow")}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{ta("workflow.h2")}</h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {(["traffic", "lead_capture", "ai_qualification", "ai_follow_up", "agent_dashboard", "closed_deal"] as const).map((stepKey, index) => (
              <div
                key={stepKey}
                className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-lg shadow-black/10 backdrop-blur-sm"
              >
                <p className="text-sm tabular-nums text-slate-400">0{index + 1}</p>
                <p className="mt-3 font-medium">{ta(`workflow.steps.${stepKey}`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audience */}
      <section className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">{ta("audience.h2")}</h2>
            <p className="mt-4 max-w-2xl text-slate-600">{ta("audience.subtitle")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(["agents", "mortgage", "teams", "loan_officers", "isa", "solo"] as const).map((itemKey) => (
              <div
                key={itemKey}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-800 ring-1 ring-slate-900/[0.03]"
              >
                {ta(`audience.items.${itemKey}`)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{ta("cta.h2")}</h2>
            <p className="mt-4 text-lg text-slate-600">{ta("cta.subtitle")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button href="/signup">{ta("cta.primary")}</Button>
              <Button href="/pricing" variant="outline">
                {ta("cta.secondary")}
              </Button>
            </div>
            <p className="mt-8">
              <Link href="/" className="text-sm font-medium text-[#0072ce] hover:text-[#005ca8]">
                {ta("cta.back_home")}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
