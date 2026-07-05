"use client";

import { useEffect, useMemo, useState } from "react";
import { messageFromUnknownError } from "@/lib/supabaseThrow";
import type { BillingCadence, PlanSlug } from "@/lib/billing/plans";

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
  name: string;
  description: string;
  /** Coaching pill text — null on free + team-with-its-own-badge. */
  coachingPill: string | null;
  /** "Popular" / other badge text — empty when unused. */
  badge?: { label: string; tone: "primary" | "signature" };
  /** Feature bullets in display order. The first line is the "Everything in X, plus:" hat. */
  features: string[];
  /** Optional footnote shown below feature list (e.g., Team seat count). */
  footnote?: string;
  /** True for the Signature visual treatment (deep navy + gold hairline). */
  signatureLook?: boolean;
  /** "Bilingual included" pill — Signature only (bilingual is table-stakes here). */
  bilingualIncludedPill?: boolean;
  /** Primary CTA label. */
  cta: string;
  /** Optional secondary link (e.g., "Talk to us first") for hybrid checkout. */
  secondaryLink?: { label: string; href: string };
};

/**
 * Per-tier display copy. Prices come from `PLANS` in
 * `lib/billing/plans.ts` so we don't drift; bullets / coaching pill
 * text / footnotes live here because they're display copy, not part
 * of the entitlement spine.
 */
const CARD_DEFS: CardDef[] = [
  {
    slug: "starter",
    name: "Starter",
    description: "For new agents testing the platform.",
    coachingPill: null,
    features: [
      "Up to 5 leads · 50 contacts",
      "2 CMA reports / day",
      "AI SMS + email responder (basic)",
      "Click-to-call (Twilio bridge)",
      "Custom fields on contacts",
      "Reviews & testimonial capture",
      "Mobile app",
      "100 AI actions / month",
    ],
    cta: "Start free",
  },
  {
    slug: "pro",
    name: "Pro",
    description: "For active agents closing deals consistently.",
    coachingPill: "RealtyBoss Coaching: Producer Track included",
    badge: { label: "Popular", tone: "primary" },
    features: [
      "Everything in Starter, plus:",
      "Up to 500 leads · 500 contacts",
      "5 CMA reports / day",
      "Bilingual English / 中文 templates & AI",
      "Producer Track coaching (auto-enrolled)",
      "Email open / click tracking",
      "Video email (record & send)",
      "Newsletter / mass-email composer",
      "Listing presentation builder",
      "Vanity / call-tracking numbers",
      "Sphere prediction + equity signals",
      "Buyer Broker Agreement (BBA) workflow",
      "Bookkeeping — invoices, expenses & receipt capture",
      "5,000 AI actions / month",
    ],
    cta: "Start 14-day trial",
  },
  {
    slug: "premium",
    name: "Premium",
    description: "For top producers running solo.",
    coachingPill: "RealtyBoss Coaching: Top Producer Track included",
    features: [
      "Everything in Pro, plus:",
      "AI Receptionist + AI Concierge — answers every call, and auto-calls for confirmations, follow-ups & surveys",
      "Unlimited leads & contacts",
      "ISA workflow + qualified handoff",
      "E-signature workflow (Dotloop / DocuSign)",
      "Advanced AI coaching + peer benchmarks",
      "Unlimited AI actions",
      "Priority support",
    ],
    cta: "Start 14-day trial",
  },
  {
    slug: "signature",
    name: "Signature",
    description: "For relationship-driven agents serving high-value clients.",
    coachingPill: "RealtyBoss Coaching: Top Producer Track included",
    badge: { label: "Bilingual & Luxury", tone: "signature" },
    signatureLook: true,
    bilingualIncludedPill: true,
    features: [
      "Everything in Premium, plus:",
      "Sphere Intelligence Pro — equity tracking, life-event signals, referral mapping",
      "White-glove onboarding — 1:1 setup with a specialist, sphere import included",
      "Concierge support — priority response, named account contact",
      "Cultural calendar automations — CNY, Mid-Autumn, Lunar holidays auto-pause / auto-greet",
      "Custom voice tuning — AI trained on your past conversations for tone match",
    ],
    cta: "Start 14-day trial",
    secondaryLink: {
      label: "Prefer a call? Talk to us first →",
      href: "/contact?topic=signature",
    },
  },
];

const TEAM_CARD: CardDef = {
  slug: "team",
  name: "Team",
  description: "For brokerages and small teams that need shared workflows.",
  coachingPill: "RealtyBoss Coaching: Top Producer Track for every seat",
  features: [
    "Everything in Premium, plus:",
    "Round-robin lead routing across the roster",
    "Per-member breakdown reporting",
    "Roster-wide dashboard rollups",
    "Top Producer Track for every member",
    "Team owner controls + seat invites",
  ],
  footnote: "Up to 5 team seats — contact sales for more.",
  cta: "Contact sales",
  secondaryLink: { label: "Talk to sales →", href: "/contact?topic=team" },
};

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
}: {
  value: BillingCadence;
  onChange: (next: BillingCadence) => void;
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
          Monthly
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
          Annual
          <span
            className={[
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              value === "annual" ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-800",
            ].join(" ")}
          >
            Save 17%
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
}: {
  slug: PlanSlug;
  cadence: BillingCadence;
  signatureLook?: boolean;
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
          Free
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
          Custom
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
          /mo
        </span>
      </div>
      {showAnnual ? (
        <div className={signatureLook ? "mt-0.5 text-[11px] text-slate-300" : "mt-0.5 text-[11px] text-gray-500"}>
          Billed {formatUsd(p.annual!, { hideCents: true })} annually
          <span
            className={[
              "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              signatureLook ? "bg-amber-300/20 text-amber-200" : "bg-emerald-100 text-emerald-800",
            ].join(" ")}
          >
            Save {formatUsd(p.monthly * 2, { hideCents: true })}
          </span>
        </div>
      ) : p.annual ? (
        <div className={signatureLook ? "mt-0.5 text-[11px] text-slate-300" : "mt-0.5 text-[11px] text-gray-500"}>
          or {formatUsd(p.annual / 12, { hideCents: false })}/mo on annual — save 2 months
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
}: {
  card: CardDef;
  cadence: BillingCadence;
  isCurrent: boolean;
  loading: boolean;
  onStarter: () => void;
  onPaid: (slug: PlanSlug) => void;
}) {
  const signatureLook = !!card.signatureLook;

  const containerCls = signatureLook
    ? "flex flex-col rounded-3xl border bg-[#0b1e3f] p-6 shadow-lg ring-1 ring-amber-300/40 text-slate-100"
    : "flex flex-col rounded-3xl border bg-white p-6 shadow-sm";

  return (
    <div className={containerCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={signatureLook ? "text-xl font-semibold text-white" : "text-xl font-semibold text-gray-900"}>
            {card.name}
          </h2>
          <div className="mt-2">
            <PriceBlock slug={card.slug} cadence={cadence} signatureLook={signatureLook} />
          </div>
          <p className={signatureLook ? "mt-3 text-sm leading-6 text-slate-300" : "mt-3 text-sm leading-6 text-gray-600"}>
            {card.description}
          </p>
        </div>

        {card.badge && (
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-medium",
              card.badge.tone === "signature"
                ? "bg-amber-300 text-amber-950"
                : "bg-gray-900 text-white",
            ].join(" ")}
          >
            {card.badge.label}
          </span>
        )}
      </div>

      {card.coachingPill && <CoachingPill text={card.coachingPill} signatureLook={signatureLook} />}
      {card.bilingualIncludedPill && (
        <div className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-white/20">
          Bilingual English / 中文 included
        </div>
      )}

      <ul className="mt-5 flex-1 space-y-2">
        {card.features.map((f) => (
          <li
            key={f}
            className={[
              "rounded-lg px-3 py-2 text-xs leading-5",
              signatureLook ? "bg-white/5 text-slate-200" : "bg-gray-50 text-gray-700",
            ].join(" ")}
          >
            {f}
          </li>
        ))}
      </ul>

      {card.footnote && (
        <p
          className={[
            "mt-3 text-[11px] italic",
            signatureLook ? "text-slate-400" : "text-gray-500",
          ].join(" ")}
        >
          {card.footnote}
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
            {isCurrent ? "Current Plan" : loading ? "Activating..." : card.cta}
          </button>
        ) : card.slug === "team" ? (
          <a
            href="/contact?topic=team"
            className="block w-full rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-gray-800"
          >
            {card.cta}
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
            {isCurrent ? "Current Plan" : loading ? "Redirecting..." : card.cta}
          </button>
        )}

        {card.secondaryLink && (
          <a
            href={card.secondaryLink.href}
            className={[
              "block text-center text-[12px] underline-offset-2 hover:underline",
              signatureLook ? "text-slate-300" : "text-gray-500",
            ].join(" ")}
          >
            {card.secondaryLink.label}
          </a>
        )}
      </div>
    </div>
  );
}

export default function AgentPricingClientPage() {
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
        throw new Error(messageFromUnknownError(json?.error, "Failed to activate Starter"));
      }
      window.location.href = json.redirectTo || "/agent/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate Starter");
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
        throw new Error(messageFromUnknownError(json?.error, "Failed to create checkout session"));
      }
      if (!json.url) throw new Error("Missing checkout URL");
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
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
            RealtyBoss for Agents
          </h1>
          {hasAccess && currentPlan ? (
            <>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600 md:text-lg">
                You&apos;re on the <strong>{currentPlan}</strong> plan. Upgrade for more capacity,
                deeper AI, and stronger coaching. Paid plans include a{" "}
                <strong>14-day free trial</strong> (card required; cancel anytime).
              </p>
              <div className="mt-4 inline-flex rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white">
                Current plan: {currentPlan}
              </div>
            </>
          ) : (
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600 md:text-lg">
              Choose a plan to get started. Paid plans include a <strong>14-day free trial</strong>{" "}
              (card required; cancel anytime during the trial).
            </p>
          )}
          <p className="mx-auto mt-3 max-w-2xl text-sm italic text-gray-500 md:text-base">
            From your first lead to your highest-value clients — available in English and 中文.
          </p>
        </div>

        <BillingToggle value={cadence} onChange={handleCadenceChange} />

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
            />
          ))}
        </div>

        {/* Team — its own row to make the brokerage positioning clear */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h3 className="text-lg font-semibold text-gray-900">For teams & brokerages</h3>
            <a
              href="/contact?topic=team"
              className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
            >
              Need more than 5 seats? Contact sales →
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
            />
          </div>
        </div>

        {/* "Which plan is right for you?" comparison */}
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-gray-900">Which plan is right for you?</h3>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">Starter</div>
              <p className="mt-2 text-sm text-gray-600">
                Best for testing the workspace and getting your first leads organized.
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">Pro</div>
              <p className="mt-2 text-sm text-gray-600">
                Best for solo agents actively converting leads. Includes Producer Track coaching
                and bilingual English / 中文 support.
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">Premium</div>
              <p className="mt-2 text-sm text-gray-600">
                Best for solo top producers wanting unlimited everything + Top Producer Track
                coaching.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
              <div className="text-sm font-semibold text-gray-900">Signature</div>
              <p className="mt-2 text-sm text-gray-600">
                Best for relationship-driven agents serving high-value and bilingual clients.
                Sphere Intelligence Pro, white-glove onboarding, and concierge support.
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">Team</div>
              <p className="mt-2 text-sm text-gray-600">
                Best for brokerages with up to 5 agents sharing leads, routing, and team-wide
                coaching.
              </p>
            </div>
          </div>

          {/* RealtyBoss Coaching callout */}
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              RealtyBoss Coaching — built into the product, not an add-on
            </p>
            <p className="mt-1.5 text-slate-700">
              Every paid plan auto-enrolls in our coaching programs:
              <strong className="ml-1">Producer Track</strong> on Pro (target: 10 transactions /
              3% conversion) and <strong>Top Producer Track</strong> on Premium, Signature, and
              Team (target: 15 transactions / 5% conversion). No upsell — the daily action plan,
              peer benchmarks, and AI deep-dives are part of the price.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
