"use client";

import { useTranslation } from "react-i18next";

import IncludedFeatures from "@/components/pricing/IncludedFeatures";

import {
  approxCallMinutes,
  approxVideos,
  CREDIT_COSTS,
  CREDIT_PACKS,
  CREDIT_TIERS,
  FREE_TIER,
  WELCOME_CREDITS,
} from "@/lib/credits/pricing";

const BRAND = "#0072ce";

/**
 * Public view of the credit ladder — the same catalog `/dashboard/credits`
 * sells, readable without an account.
 *
 * Every number on this page is read from `lib/credits/pricing.ts`, never typed
 * here. The tier blurbs drifted twice while they carried hand-written figures,
 * so nothing quantitative is written into copy: prices and allotments come from
 * CREDIT_TIERS, and the "what this buys you" line is computed from CREDIT_COSTS
 * by the same helpers the dashboard uses. Change a rate there and this page
 * moves with it.
 *
 * The CTAs deliberately do NOT start a checkout. Buying needs an account (the
 * subscription is keyed to a user), so they hand off to `/dashboard/credits`,
 * which owns the real purchase flow and bounces signed-out visitors through
 * login. Duplicating checkout here would mean a second code path to keep
 * correct, and a 401 for anyone not signed in.
 */
export default function PlansClientPage() {
  const { t } = useTranslation("web_plans");

  const metered: Array<{ label: string; detail: string }> = [
    {
      label: t("costs.voice"),
      detail: t("costs.voiceUnit", { n: CREDIT_COSTS.voicePerMinute }),
    },
    {
      label: t("costs.listingClip"),
      detail: t("costs.each", { n: CREDIT_COSTS.listingClip }),
    },
    {
      label: t("costs.twinAvatar"),
      detail: t("costs.each", { n: CREDIT_COSTS.twinAvatar }),
    },
    {
      label: t("costs.ctaEndCard"),
      detail: t("costs.each", { n: CREDIT_COSTS.ctaEndCard }),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 md:px-6">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-gray-900 md:text-5xl">
            {t("header.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-gray-600 md:text-lg">
            {t("header.subtitle")}
          </p>
          <p className="mt-3 text-sm text-gray-500">
            {t("header.trial")}
          </p>
        </header>

        <IncludedFeatures />

        {/* Monthly plans */}
        <section>
          <h2 className="mb-1 text-lg font-bold text-gray-900">{t("plans.heading")}</h2>
          <p className="mb-4 text-sm text-gray-500">{t("plans.help")}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {/* Free is not in CREDIT_TIERS — that list drives Stripe checkout and
                every row in it needs a price id. It is rendered first because
                it is where most people start. */}
            <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold" style={{ color: BRAND }}>
                {t("plans.freeName")}
              </p>
              <p className="mt-1 text-3xl font-extrabold text-gray-900">
                {t("plans.freePrice")}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-700">
                {FREE_TIER.monthlyCredits.toLocaleString()} {t("plans.creditsPerMo")}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {t("plans.usage", {
                  minutes: approxCallMinutes(FREE_TIER.monthlyCredits).toLocaleString(),
                  videos: approxVideos(FREE_TIER.monthlyCredits, "twinAvatar").toLocaleString(),
                })}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {t("plans.welcomeGrant", { credits: WELCOME_CREDITS.toLocaleString() })}
              </p>
              <p className="mt-1 flex-1 text-xs text-gray-500">
                {t("plans.blurb.free", { defaultValue: FREE_TIER.blurb })}
              </p>
              <a
                href="/agent-signup"
                className="mt-5 w-full rounded-xl border py-2.5 text-center text-sm font-bold shadow-sm transition hover:bg-gray-50"
                style={{ borderColor: BRAND, color: BRAND }}
              >
                {t("plans.freeCta")}
              </a>
            </div>
            {CREDIT_TIERS.map((tier) => (
              <div
                key={tier.id}
                className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-semibold" style={{ color: BRAND }}>
                  {tier.name}
                </p>
                <p className="mt-1 text-3xl font-extrabold text-gray-900">
                  ${tier.priceUsd}
                  <span className="text-base font-normal text-gray-500">{t("plans.perMonth")}</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-700">
                  {tier.monthlyCredits.toLocaleString()} {t("plans.creditsPerMo")}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {t("plans.usage", {
                    minutes: approxCallMinutes(tier.monthlyCredits).toLocaleString(),
                    videos: approxVideos(tier.monthlyCredits, "twinAvatar").toLocaleString(),
                  })}
                </p>
                {/* Positioning prose, so it belongs in i18n — pricing.ts holds
                    the English original and is the fallback if a key is missing.
                    Numbers deliberately stay out of it; that is what drifted. */}
                {tier.setupFeeUsd ? (
                  <p className="mt-1 text-xs font-medium text-gray-700">
                    {t("plans.setupFee", { amount: tier.setupFeeUsd.toLocaleString() })}
                  </p>
                ) : null}
                <p className="mt-1 flex-1 text-xs text-gray-500">
                  {t(`plans.blurb.${tier.id}`, { defaultValue: tier.blurb })}
                </p>
                <a
                  href="/dashboard/credits"
                  className="mt-5 w-full rounded-xl py-2.5 text-center text-sm font-bold text-white shadow transition hover:opacity-90"
                  style={{ background: BRAND }}
                >
                  {t("plans.cta")}
                </a>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {t("brokerage.prompt")}{" "}
            <a
              href="/contact?topic=team"
              className="font-medium underline"
              style={{ color: BRAND }}
            >
              {t("brokerage.link")}
            </a>
          </p>
        </section>

        {/* Top-up packs */}
        <section>
          <h2 className="mb-1 text-lg font-bold text-gray-900">{t("packs.heading")}</h2>
          <p className="mb-4 text-sm text-gray-500">{t("packs.help")}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.id}
                className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <p className="text-2xl font-extrabold text-gray-900">
                  {pack.credits.toLocaleString()}{" "}
                  <span className="text-base font-normal text-gray-500">{t("packs.credits")}</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-700">
                  ${pack.priceUsd}{" "}
                  <span className="font-normal text-gray-500">{t("packs.oneTime")}</span>
                </p>
                <a
                  href="/dashboard/credits"
                  className="mt-5 w-full rounded-xl border border-gray-200 bg-white py-2.5 text-center text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
                >
                  {t("packs.cta")}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* What costs credits — the whole point of "everything included" is that
            this list is short and checkable, so it is generated from the same
            constants the meter charges against. */}
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">{t("costs.heading")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("costs.help")}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metered.map((row) => (
              <div key={row.label} className="rounded-2xl bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-900">{row.label}</div>
                <p className="mt-1 text-sm text-gray-600">{row.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
            <p className="text-sm font-semibold text-emerald-900">{t("costs.freeHeading")}</p>
            <p className="mt-1.5 text-sm text-emerald-900/80">{t("costs.free")}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
