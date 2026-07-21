"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { messageFromUnknownError } from "@/lib/supabaseThrow";
import type { BillingCadence, PlanSlug } from "@/lib/billing/plans";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

type EntitlementPlan = "starter" | "growth" | "elite" | "signature" | "team";

type AccessResponse = {
  success?: boolean;
  ok?: boolean;
  hasAccess: boolean;
  entitlement: {
    plan: EntitlementPlan;
    is_active: boolean;
  } | null;
};

/**
 * Maps the entitlements dialect (`starter | growth | elite | signature | team`)
 * onto the catalog dialect used by the new CRM checkout endpoint
 * (`starter | pro | premium | signature | team`). Surface so the
 * "Current Plan" badge resolves correctly regardless of which dialect
 * the access-check endpoint returns.
 */
function entitlementToCatalogSlug(p: EntitlementPlan): PlanSlug {
  switch (p) {
    case "growth":
      return "pro";
    case "elite":
      return "premium";
    default:
      return p;
  }
}

type CardDef = {
  slug: PlanSlug;
  /** i18n key prefix under `plans.<slug>` in web_agent_pricing. */
  i18nKey: "starter" | "pro" | "premium" | "signature" | "team";
  /** Whether a coaching pill is shown (text comes from i18n). */
  hasCoachingPill?: boolean;
  /** Badge tone — label text comes from i18n. */
  badgeTone?: "primary" | "signature";
  /** Number of feature bullets (for i18n array indexing). */
  featureCount: number;
  /** Whether a footnote is shown (text comes from i18n). */
  hasFootnote?: boolean;
  /** True for the Signature visual treatment (deep navy + gold hairline). */
  signatureLook?: boolean;
  /** "Bilingual included" pill — Signature only (bilingual is table-stakes here). */
  bilingualIncludedPill?: boolean;
  /** Optional secondary link href (label comes from i18n). */
  secondaryLinkHref?: string;
};

/**
 * Per-tier structural definition. Prices come from `PRICES` below;
 * all display copy (name, description, coaching pill, badge label,
 * feature bullets, footnote, CTA, secondary link) is resolved via
 * i18n from the `web_agent_pricing` namespace keyed off `i18nKey`.
 */
const CARD_DEFS: CardDef[] = [
  {
    slug: "starter",
    i18nKey: "starter",
    featureCount: 8,
  },
  {
    slug: "pro",
    i18nKey: "pro",
    hasCoachingPill: true,
    badgeTone: "primary",
    featureCount: 14,
  },
  {
    slug: "premium",
    i18nKey: "premium",
    hasCoachingPill: true,
    featureCount: 8,
  },
  {
    slug: "signature",
    i18nKey: "signature",
    hasCoachingPill: true,
    badgeTone: "signature",
    signatureLook: true,
    bilingualIncludedPill: true,
    featureCount: 6,
    secondaryLinkHref: "/contact?topic=signature",
  },
];

const TEAM_CARD: CardDef = {
  slug: "team",
  i18nKey: "team",
  hasCoachingPill: true,
  featureCount: 6,
  hasFootnote: true,
  secondaryLinkHref: "/contact?topic=team",
};

/** Pull the `features` array for a card from i18n as string[]. */
function cardFeatures(t: TFn, card: CardDef): string[] {
  return Array.from({ length: card.featureCount }, (_, i) =>
    t(`plans.${card.i18nKey}.features.${i}`),
  );
}

const PRICES: Record<PlanSlug, { monthly: number; annual: number | null }> = {
  starter: { monthly: 0, annual: null },
  pro: { monthly: 79, annual: 790 },
  premium: { monthly: 199, annual: 1990 },
  signature: { monthly: 399, annual: 3990 },
  // Team is sales-led (per-seat) — PriceBlock renders "Custom", not these.
  team: { monthly: 299, annual: 2990 },
};

const CADENCE_STORAGE_KEY = "leadsmart_pricing_cadence_v1";

function formatUsd(amount: number, opts?: { hideCents?: boolean }): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.hideCents ? 0 : amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Sticky billing toggle. Defaults to monthly on first visit; remembers
 * choice across navigation via sessionStorage.
 */
function BillingToggle({
  value,
  onChange,
  t,
}: {
  value: BillingCadence;
  onChange: (next: BillingCadence) => void;
  t: TFn;
}) {
  return (
    <div className="sticky top-2 z-10 mx-auto flex justify-center pt-2">
      <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onChange("monthly")}
          aria-pressed={value === "monthly"}
          className={[
            "rounded-full px-4 py-1.5 text-sm font-medium transition",
            value === "monthly"
              ? "bg-gray-900 text-white shadow-sm"
              : "text-gray-600 hover:text-gray-900",
          ].join(" ")}
        >
          {t("billing.monthly")}
        </button>
        <button
          type="button"
          onClick={() => onChange("annual")}
          aria-pressed={value === "annual"}
          className={[
            "ml-1 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition",
            value === "annual"
              ? "bg-gray-900 text-white shadow-sm"
              : "text-gray-600 hover:text-gray-900",
          ].join(" ")}
        >
          {t("billing.annual")}
          <span
            className={[
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              value === "annual" ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-800",
            ].join(" ")}
          >
            {t("billing.save_badge")}
          </span>
        </button>
      </div>
    </div>
  );
}

function PriceBlock({
  slug,
  cadence,
  signatureLook,
  t,
}: {
  slug: PlanSlug;
  cadence: BillingCadence;
  signatureLook?: boolean;
  t: TFn;
}) {
  const p = PRICES[slug];
  if (slug === "starter") {
    return (
      <div className="flex items-baseline gap-1">
        <span
          className={[
            "text-3xl font-semibold tracking-tight",
            signatureLook ? "text-white" : "text-gray-900",
          ].join(" ")}
        >
          {t("price.free")}
        </span>
      </div>
    );
  }
  if (slug === "team") {
    // Per-seat pricing is sales-led — no self-serve number on the card.
    return (
      <div className="flex items-baseline gap-1">
        <span
          className={[
            "text-3xl font-semibold tracking-tight",
            signatureLook ? "text-white" : "text-gray-900",
          ].join(" ")}
        >
          {t("price.custom")}
        </span>
      </div>
    );
  }
  const showAnnual = cadence === "annual" && p.annual != null;
  const headline = showAnnual ? p.annual! / 12 : p.monthly;
  const headlineLabel = showAnnual
    ? `${formatUsd(headline, { hideCents: false })}`
    : `${formatUsd(headline, { hideCents: true })}`;

  return (
    <div className="flex flex-col items-start">
      <div className="flex items-baseline gap-1.5">
        <span
          className={[
            "text-4xl font-semibold tracking-tight",
            signatureLook ? "text-white" : "text-gray-900",
          ].join(" ")}
        >
          {headlineLabel}
        </span>
        <span className={signatureLook ? "text-xs text-slate-300" : "text-xs text-gray-500"}>
          {t("price.per_month")}
        </span>
      </div>
      {showAnnual ? (
        <div className={signatureLook ? "mt-0.5 text-[11px] text-slate-300" : "mt-0.5 text-[11px] text-gray-500"}>
          {t("price.billed_annually", { amount: formatUsd(p.annual!, { hideCents: true }) })}
          <span
            className={[
              "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              signatureLook ? "bg-amber-300/20 text-amber-200" : "bg-emerald-100 text-emerald-800",
            ].join(" ")}
          >
            {t("price.save_amount", { amount: formatUsd(p.monthly * 2, { hideCents: true }) })}
          </span>
        </div>
      ) : p.annual ? (
        <div className={signatureLook ? "mt-0.5 text-[11px] text-slate-300" : "mt-0.5 text-[11px] text-gray-500"}>
          {t("price.annual_note", { amount: formatUsd(p.annual / 12, { hideCents: false }) })}
        </div>
      ) : null}
    </div>
  );
}

function CoachingPill({ text, signatureLook }: { text: string; signatureLook?: boolean }) {
  return (
    <div
      className={[
        "mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1",
        signatureLook
          ? "bg-amber-300/10 text-amber-200 ring-amber-300/30"
          : "bg-blue-50 text-blue-700 ring-blue-200",
      ].join(" ")}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 2 L15 8.5 L22 9.5 L17 14.5 L18.5 22 L12 18 L5.5 22 L7 14.5 L2 9.5 L9 8.5 Z" />
      </svg>
      {text}
    </div>
  );
}

function PlanCard({
  card,
  cadence,
  isCurrent,
  loading,
  onStarter,
  onPaid,
  t,
}: {
  card: CardDef;
  cadence: BillingCadence;
  isCurrent: boolean;
  loading: boolean;
  onStarter: () => void;
  onPaid: (slug: PlanSlug) => void;
  t: TFn;
}) {
  const signatureLook = !!card.signatureLook;
  const base = `plans.${card.i18nKey}`;
  const features = cardFeatures(t, card);

  const containerCls = signatureLook
    ? "flex flex-col rounded-3xl border bg-[#0b1e3f] p-6 shadow-lg ring-1 ring-amber-300/40 text-slate-100"
    : "flex flex-col rounded-3xl border bg-white p-6 shadow-sm";

  return (
    <div className={containerCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={signatureLook ? "text-xl font-semibold text-white" : "text-xl font-semibold text-gray-900"}>
            {t(`${base}.name`)}
          </h2>
          <div className="mt-2">
            <PriceBlock slug={card.slug} cadence={cadence} signatureLook={signatureLook} t={t} />
          </div>
          <p className={signatureLook ? "mt-3 text-sm leading-6 text-slate-300" : "mt-3 text-sm leading-6 text-gray-600"}>
            {t(`${base}.description`)}
          </p>
        </div>

        {card.badgeTone && (
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-medium",
              card.badgeTone === "signature"
                ? "bg-amber-300 text-amber-950"
                : "bg-gray-900 text-white",
            ].join(" ")}
          >
            {t(`${base}.badge`)}
          </span>
        )}
      </div>

      {card.hasCoachingPill && <CoachingPill text={t(`${base}.coaching_pill`)} signatureLook={signatureLook} />}
      {card.bilingualIncludedPill && (
        <div className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-white/20">
          {t("bilingual_pill")}
        </div>
      )}

      <ul className="mt-5 flex-1 space-y-2">
        {features.map((f, i) => (
          <li
            key={i}
            className={[
              "rounded-lg px-3 py-2 text-xs leading-5",
              signatureLook ? "bg-white/5 text-slate-200" : "bg-gray-50 text-gray-700",
            ].join(" ")}
          >
            {f}
          </li>
        ))}
      </ul>

      {card.hasFootnote && (
        <p
          className={[
            "mt-3 text-[11px] italic",
            signatureLook ? "text-slate-400" : "text-gray-500",
          ].join(" ")}
        >
          {t(`${base}.footnote`)}
        </p>
      )}

      <div className="mt-5 space-y-2">
        {card.slug === "starter" ? (
          <button
            type="button"
            disabled={isCurrent || loading}
            onClick={onStarter}
            className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isCurrent ? t("state.current") : loading ? t("state.activating") : t(`${base}.cta`)}
          </button>
        ) : card.slug === "team" ? (
          <a
            href="/contact?topic=team"
            className="block w-full rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-gray-800"
          >
            {t(`${base}.cta`)}
          </a>
        ) : (
          <button
            type="button"
            disabled={isCurrent || loading}
            onClick={() => onPaid(card.slug)}
            className={[
              "w-full rounded-2xl px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed",
              signatureLook
                ? "bg-amber-300 text-amber-950 hover:bg-amber-200 disabled:bg-amber-300/40 disabled:text-amber-900/60"
                : "bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300",
            ].join(" ")}
          >
            {isCurrent ? t("state.current") : loading ? t("state.redirecting") : t(`${base}.cta`)}
          </button>
        )}

        {card.secondaryLinkHref && (
          <a
            href={card.secondaryLinkHref}
            className={[
              "block text-center text-[12px] underline-offset-2 hover:underline",
              signatureLook ? "text-slate-300" : "text-gray-500",
            ].join(" ")}
          >
            {t(`${base}.secondary_link`)}
          </a>
        )}
      </div>
    </div>
  );
}

export default function AgentPricingClientPage() {
  const { t } = useTranslation("web_agent_pricing");
  const [loadingSlug, setLoadingSlug] = useState<PlanSlug | "">("");
  const [currentPlan, setCurrentPlan] = useState<PlanSlug | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState("");
  const [cadence, setCadence] = useState<BillingCadence>("monthly");

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(CADENCE_STORAGE_KEY);
      if (stored === "annual" || stored === "monthly") {
        setCadence(stored);
      }
    } catch {
      // sessionStorage unavailable (private mode) — leave default
    }
  }, []);

  function handleCadenceChange(next: BillingCadence) {
    setCadence(next);
    try {
      sessionStorage.setItem(CADENCE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  async function loadAccess() {
    try {
      const res = await fetch("/api/agent/access-check", {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json()) as AccessResponse;
      if (json?.success === true || json?.ok === true) {
        setHasAccess(json.hasAccess);
        setCurrentPlan(json.entitlement?.plan ? entitlementToCatalogSlug(json.entitlement.plan) : null);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    void loadAccess();
  }, []);

  async function handleStarter() {
    try {
      setLoadingSlug("starter");
      setError("");
      const res = await fetch("/api/agent/start-free", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        ok?: boolean;
        error?: unknown;
        redirectTo?: string;
      };
      if (!res.ok || json?.success === false || json?.ok === false) {
        throw new Error(messageFromUnknownError(json?.error, t("error.activate_starter")));
      }
      window.location.href = json.redirectTo || "/agent/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error.activate_starter"));
    } finally {
      setLoadingSlug("");
    }
  }

  async function handlePaid(slug: PlanSlug) {
    try {
      setLoadingSlug(slug);
      setError("");
      const res = await fetch("/api/billing/crm/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, cadence, with_trial: true }),
      });
      const json = (await res.json()) as { success?: boolean; error?: unknown; url?: string };
      if (!res.ok) {
        throw new Error(messageFromUnknownError(json?.error, t("error.checkout_session")));
      }
      if (!json.url) throw new Error(t("error.missing_url"));
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error.start_checkout"));
    } finally {
      setLoadingSlug("");
    }
  }

  const topFour = useMemo(() => CARD_DEFS, []);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 md:px-6">
      <div className="mx-auto max-w-7xl space-y-10">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-gray-900 md:text-5xl">
            {t("header.title")}
          </h1>
          {hasAccess && currentPlan ? (
            <>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600 md:text-lg">
                {t("header.current_intro_pre")}
                <strong>{currentPlan}</strong>
                {t("header.current_intro_plan_suffix")}
                <strong>{t("header.trial_bold")}</strong>
                {t("header.current_intro_post")}
              </p>
              <div className="mt-4 inline-flex rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white">
                {t("header.current_badge", { plan: currentPlan })}
              </div>
            </>
          ) : (
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600 md:text-lg">
              {t("header.choose_intro_pre")}
              <strong>{t("header.trial_bold")}</strong>
              {t("header.choose_intro_post")}
            </p>
          )}
          <p className="mx-auto mt-3 max-w-2xl text-sm italic text-gray-500 md:text-base">
            {t("header.tagline")}
          </p>
        </div>

        <BillingToggle value={cadence} onChange={handleCadenceChange} t={t} />

        {error && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Solo tiers — 4-up on desktop, 2-up on tablet, stacked on mobile */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {topFour.map((card) => (
            <PlanCard
              key={card.slug}
              card={card}
              cadence={cadence}
              isCurrent={currentPlan === card.slug}
              loading={loadingSlug === card.slug}
              onStarter={handleStarter}
              onPaid={handlePaid}
              t={t}
            />
          ))}
        </div>

        {/* Team — its own row to make the brokerage positioning clear */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h3 className="text-lg font-semibold text-gray-900">{t("team_section.heading")}</h3>
            <a
              href="/contact?topic=team"
              className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
            >
              {t("team_section.contact_link")}
            </a>
          </div>
          <div className="grid grid-cols-1">
            <PlanCard
              card={TEAM_CARD}
              cadence={cadence}
              isCurrent={currentPlan === "team"}
              loading={loadingSlug === "team"}
              onStarter={handleStarter}
              onPaid={handlePaid}
              t={t}
            />
          </div>
        </div>

        {/* "Which plan is right for you?" comparison */}
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-gray-900">{t("which.heading")}</h3>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">{t("which.starter.name")}</div>
              <p className="mt-2 text-sm text-gray-600">
                {t("which.starter.body")}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">{t("which.pro.name")}</div>
              <p className="mt-2 text-sm text-gray-600">
                {t("which.pro.body")}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">{t("which.premium.name")}</div>
              <p className="mt-2 text-sm text-gray-600">
                {t("which.premium.body")}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
              <div className="text-sm font-semibold text-gray-900">{t("which.signature.name")}</div>
              <p className="mt-2 text-sm text-gray-600">
                {t("which.signature.body")}
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">{t("which.team.name")}</div>
              <p className="mt-2 text-sm text-gray-600">
                {t("which.team.body")}
              </p>
            </div>
          </div>

          {/* CloseBoss Coaching callout */}
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              {t("coaching_callout.heading")}
            </p>
            <p className="mt-1.5 text-slate-700">
              {t("coaching_callout.body_pre")}
              <strong className="ml-1">{t("coaching_callout.producer_track")}</strong>
              {t("coaching_callout.body_mid")}
              <strong>{t("coaching_callout.top_producer_track")}</strong>
              {t("coaching_callout.body_post")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
