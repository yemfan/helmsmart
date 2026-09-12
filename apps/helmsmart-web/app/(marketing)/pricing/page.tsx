import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { getServerT } from "@/lib/i18n/server";
import { rich } from "../_rich";
import { pageAlternates } from "@/lib/i18n/pageAlternates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return {
    alternates: await pageAlternates("/pricing"),
    title: t("pricing.meta.title"),
    description: t("pricing.meta.description"),
  };
}

// Name, price, description, CTA label and every feature line live in
// `site.pricing.plans.<id>`; this array holds the id, the styling and the
// destination — which are not copy.
//
// These are the plans for AFTER beta. Nothing sells them yet: there is no
// subscription checkout, `organizations.plan` gates nothing, and Settings tells
// every account it is "Free during beta". So the page leads with the offer that
// is true today and labels the tiers as what comes next, instead of selling
// tiers the product does not have. Call minutes are free today for the same
// reason — `lib/voice-billing.ts` bills only orgs whose subscription_status is
// "active", and nothing sets it.
const tiers = [
  {
    id: "starter",
    featured: false,
    ctaHref: "/signup",
    features: ["f1", "f2", "f3", "f4", "f5"],
  },
  {
    id: "growth",
    featured: true,
    ctaHref: "/signup",
    features: ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"],
  },
  {
    id: "pro",
    featured: false,
    ctaHref: "/contact/sales",
    features: ["f1", "f2", "f3", "f4", "f5", "f6", "f7"],
  },
];

const faqs = ["beta", "afterBeta", "cancel", "alwaysOn", "refunds"];

export default async function PricingPage() {
  const t = await getServerT("site");

  return (
    <main className="bg-white">
      {/* The offer that is true today */}
      <section className="py-20 px-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          {t("pricing.hero.title")}
        </h1>
        <p className="mt-4 text-lg text-gray-500">
          {t("pricing.hero.subtitle")}
        </p>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            {t("pricing.hero.cta")}
          </Link>
        </div>
        <p className="mt-4 text-sm text-gray-500">{t("pricing.hero.note")}</p>
      </section>

      {/* Planned pricing after beta */}
      <section className="pb-24 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold text-gray-900">
              {t("pricing.afterBeta.title")}
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              {t("pricing.afterBeta.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className={[
                  "relative flex flex-col rounded-2xl p-8 shadow-sm",
                  tier.featured
                    ? "border-2 border-indigo-600 bg-white"
                    : "border border-gray-200 bg-white",
                ].join(" ")}
              >
                {tier.featured && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    {t("pricing.recommended")}
                  </span>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {t(`pricing.plans.${tier.id}.name`)}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {t(`pricing.plans.${tier.id}.description`)}
                  </p>
                  <p className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight text-gray-900">
                      {t(`pricing.plans.${tier.id}.price`)}
                    </span>
                    <span className="text-gray-500">{t("pricing.perMonth")}</span>
                  </p>
                </div>

                <ul className="mb-8 flex-1 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check
                        className={[
                          "mt-0.5 h-5 w-5 flex-shrink-0",
                          tier.featured ? "text-indigo-600" : "text-green-500",
                        ].join(" ")}
                      />
                      <span className="text-sm text-gray-700">
                        {t(`pricing.plans.${tier.id}.features.${feature}`)}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href={tier.ctaHref}
                  className={[
                    "block rounded-lg px-6 py-3 text-center text-sm font-semibold transition-colors",
                    tier.featured
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-100 text-gray-900 hover:bg-gray-200",
                  ].join(" ")}
                >
                  {t(`pricing.plans.${tier.id}.cta`)}
                </a>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-gray-500">
            {t("pricing.afterBeta.voice")}
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-20 px-4">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">
            {t("pricing.faq.title")}
          </h2>
          <dl className="space-y-8">
            {faqs.map((faq) => (
              <div key={faq}>
                <dt className="text-base font-semibold text-gray-900">
                  {t(`pricing.faq.items.${faq}.question`)}
                </dt>
                <dd className="mt-2 text-sm text-gray-600 leading-relaxed">
                  {t(`pricing.faq.items.${faq}.answer`)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Bottom CTA — /contact is the email inbox and form; there is no chat. */}
      <section className="py-16 px-4 text-center">
        <p className="text-gray-500 text-sm">
          {rich(t("pricing.stillQuestions"), {
            links: [
              {
                href: "/contact",
                className:
                  "font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2",
              },
            ],
          })}
        </p>
      </section>
    </main>
  );
}
