/**
 * Root page — public landing for guests, redirect to /home for authenticated users.
 * Includes MarketingNav + MarketingFooter directly (outside the (marketing) route group).
 */

import Link from "next/link";
import { Phone, PhoneOutgoing, Inbox, Receipt, Calendar, Users, Sunrise, Sparkles, CheckCircle } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { getServerT } from "@/lib/i18n/server";
import { rich } from "./(marketing)/_rich";

// Copy lives in `site.landing.*`; these arrays hold only the key and the styling.
const STEPS = ["call", "invoice", "briefing"];

const FEATURES = [
  { key: "receptionist", icon: Phone, color: "text-indigo-600 bg-indigo-50" },
  { key: "concierge", icon: PhoneOutgoing, color: "text-teal-600 bg-teal-50" },
  { key: "assistant", icon: Sparkles, color: "text-blue-600 bg-blue-50" },
  { key: "inbox", icon: Inbox, color: "text-emerald-600 bg-emerald-50" },
  { key: "invoicing", icon: Receipt, color: "text-amber-600 bg-amber-50" },
  { key: "calendar", icon: Calendar, color: "text-violet-600 bg-violet-50" },
  { key: "crm", icon: Users, color: "text-rose-600 bg-rose-50" },
  { key: "briefing", icon: Sunrise, color: "text-sky-600 bg-sky-50" },
];

// Capabilities the code can show, not outcomes nobody measured. The band used
// to read "< 2 min to book" and "10+ hours saved per week" — numbers with no
// source. Each of these is checkable: the receptionist has no business-hours
// gate on answering, SUPPORTED_LOCALES is en / zh-Hans / es, and the Retell
// webhook stores every call's summary and transcript on voice_sessions.
const STATS = ["alwaysOn", "languages", "transcripts"];

export default async function RootPage() {
  const t = await getServerT("site");

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <MarketingNav />

      <main className="flex-1 text-gray-900">
        {/* HERO */}
        <section className="relative overflow-hidden bg-white">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="h-[600px] w-[600px] rounded-full bg-indigo-100 opacity-50 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-5xl px-6 py-24 text-center sm:py-32">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
              <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden="true" />
              {t("landing.badge")}
            </div>
            <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              {rich(t("landing.hero.title"), { emClassName: "text-indigo-600" })}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 sm:text-xl">
              {t("landing.hero.subtitle")}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center rounded-xl bg-indigo-600 px-7 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors">
                {t("landing.hero.startFree")}
              </Link>
              {/* The public demo-request form. This used to be /login?next=/calendar/book —
                  the signed-in staff booking form — so a prospect got a sign-in wall. */}
              <Link href="/contact/sales" className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-7 py-3.5 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
                {t("landing.hero.bookDemo")}
              </Link>
              <a href="#features" className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-7 py-3.5 text-base font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
                {t("landing.hero.seeHow")}
              </a>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="bg-gray-50 py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t("landing.how.title")}</h2>
              <p className="mt-3 text-lg text-gray-500">{t("landing.how.subtitle")}</p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-3">
              {STEPS.map((key, i) => (
                <div key={key} className="relative rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
                  <span className="text-5xl font-black text-indigo-50 select-none">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 text-lg font-semibold text-gray-900">{t(`landing.how.steps.${key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">{t(`landing.how.steps.${key}.description`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t("landing.features.title")}</h2>
              <p className="mt-3 text-lg text-gray-500">{t("landing.features.subtitle")}</p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.key} className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
                    <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${feature.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-gray-900">{t(`landing.features.items.${feature.key}.title`)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">{t(`landing.features.items.${feature.key}.description`)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="border-y border-gray-100 bg-gray-50 py-14">
          <div className="mx-auto max-w-4xl px-6">
            <dl className="grid gap-10 sm:grid-cols-3 sm:gap-0 text-center">
              {STATS.map((key) => (
                <div key={key} className="sm:border-r sm:border-gray-200 last:border-0 px-4">
                  <dt className="text-4xl font-extrabold text-indigo-600">{t(`landing.stats.${key}.value`)}</dt>
                  <dd className="mt-2 text-sm text-gray-500">{t(`landing.stats.${key}.label`)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* EXAMPLE SCENARIO — an illustration of the product, not a customer
            quote. It sat under "Real businesses. Real results." with five stars
            and a named owner of a named business, none of whom exists. The
            words are kept; what they claimed to be is not. */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t("landing.example.title")}</h2>
            <figure className="mt-12 rounded-2xl border border-gray-100 bg-white p-10 shadow-sm">
              <figcaption className="mb-6 inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                {t("landing.example.label")}
              </figcaption>
              <blockquote className="text-lg leading-relaxed text-gray-700 italic">
                &ldquo;{t("landing.example.quote")}&rdquo;
              </blockquote>
            </figure>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-4xl px-6">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-16 text-center shadow-xl sm:px-16">
              <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white opacity-5" aria-hidden="true" />
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white opacity-5" aria-hidden="true" />
              <div className="relative">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white">
                  <CheckCircle className="h-4 w-4" />
                  {t("landing.finalCta.badge")}
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t("landing.finalCta.title")}</h2>
                <p className="mt-4 text-lg text-indigo-100">{t("landing.finalCta.subtitle")}</p>
                <div className="mt-10">
                  <Link href="/signup" className="inline-flex items-center rounded-xl bg-white px-8 py-4 text-base font-semibold text-indigo-600 shadow-sm hover:bg-indigo-50 transition-colors">
                    {t("landing.finalCta.cta")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
