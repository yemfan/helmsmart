"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type PlanSlug = "starter" | "pro" | "premium" | "team";

/**
 * Wire shape returned by `/api/billing/subscription` — server hands
 * the full `PLANS` map straight through, so the rich fields
 * (displayName / tagline / coachingTier / popular / price /
 * features) are all available here. Older fields are kept on the
 * type to ease the rename — anything we don't read is just ignored.
 */
type CatalogEntry = {
  slug: PlanSlug;
  displayName: string;
  tagline: string;
  price: number;
  features: readonly string[];
  coachingTier?: string;
  popular?: boolean;
};

type Catalog = Record<PlanSlug, CatalogEntry>;

type Invoice = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  pdf: string | null;
};

type PaymentMethod = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

type SubscriptionPayload = {
  plan: PlanSlug;
  status: string;
  features: readonly string[];
  tier: { price: number; features: readonly string[] };
} | null;

const BRAND = "#0072CE";

/**
 * Display metadata is now served by the API alongside `price` /
 * `features` (catalog entry includes `displayName`, `tagline`,
 * `popular`). Kept this lookup table for the feature flag → label
 * mapping only — the new `producer_track_coaching` /
 * `top_producer_track_coaching` flags use marketing-style copy.
 */
const FEATURE_LABELS: Record<string, string> = {
  basic_crm: "Core CRM",
  limited_ai: "AI drafts (limited)",
  full_ai: "Unlimited AI drafts",
  automation: "Follow-up automation",
  prediction: "Lead predictions",
  multi_agent: "Multi-agent workspace",
  routing: "Smart lead routing",
  producer_track_coaching: "Producer Track coaching",
  top_producer_track_coaching: "Top Producer Track coaching",
  bookkeeping: "Bookkeeping (invoices & expenses)",
  ai_calling: "AI Concierge (outbound calls)",
};

function featureLabel(key: string) {
  return FEATURE_LABELS[key] ?? key.replace(/_/g, " ");
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    active: { bg: "#dcfce7", text: "#166534" },
    trialing: { bg: "#dbeafe", text: "#1e40af" },
    past_due: { bg: "#fef9c3", text: "#854d0e" },
    canceled: { bg: "#f1f5f9", text: "#475569" },
    incomplete: { bg: "#fee2e2", text: "#991b1b" },
  };
  const s = map[status.toLowerCase()] ?? { bg: "#f1f5f9", text: "#475569" };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      {capitalize(status)}
    </span>
  );
}

function CardBrandIcon({ brand }: { brand: string }) {
  const b = brand.toLowerCase();
  const color =
    b === "visa" ? "#1a1f71" : b === "mastercard" ? "#eb001b" : b === "amex" ? "#007bc1" : "#64748b";
  return (
    <span
      className="inline-flex h-6 w-10 items-center justify-center rounded border border-slate-200 text-[10px] font-bold tracking-wide"
      style={{ color, background: "#f8fafc" }}
    >
      {b === "visa" ? "VISA" : b === "mastercard" ? "MC" : b === "amex" ? "AMEX" : capitalize(brand)}
    </span>
  );
}

export default function BillingPageClient() {
  const searchParams = useSearchParams();
  const canceled = searchParams?.get("canceled") === "1";
  const checkoutOk = searchParams?.get("checkout") === "success";
  const checkoutErr = searchParams?.get("checkout_error") ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionPayload>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [busyPlan, setBusyPlan] = useState<PlanSlug | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscription", { credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        subscription?: SubscriptionPayload;
        catalog?: Catalog;
        currentPeriodEnd?: string | null;
        cancelAtPeriodEnd?: boolean;
        invoices?: Invoice[];
        paymentMethod?: PaymentMethod | null;
      };
      if (!res.ok || body.ok === false) {
        setError(typeof body.error === "string" ? body.error : "Could not load subscription");
        return;
      }
      setSubscription(body.subscription ?? null);
      setCatalog(body.catalog ?? null);
      setCurrentPeriodEnd(body.currentPeriodEnd ?? null);
      setCancelAtPeriodEnd(body.cancelAtPeriodEnd ?? false);
      setInvoices(body.invoices ?? []);
      setPaymentMethod(body.paymentMethod ?? null);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startCheckout = async (plan: PlanSlug) => {
    setBusyPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/crm-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || body.ok === false || !body.url) {
        setError(typeof body.error === "string" ? body.error : "Checkout failed");
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Could not start checkout");
    } finally {
      setBusyPlan(null);
    }
  };

  const openPortal = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || body.ok === false || !body.url) {
        setError(typeof body.error === "string" ? body.error : "Could not open portal");
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Could not open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  /**
   * Render order matches the catalog (Starter → Pro → Premium →
   * Team). Listed explicitly here rather than `Object.keys(catalog)`
   * so the order is deterministic and not dependent on JS object
   * insertion ordering.
   */
  const tiers: PlanSlug[] = ["starter", "pro", "premium", "team"];

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-text">
            Billing &amp; Subscription
          </h1>
          <p className="mt-1 text-sm text-brand-text/60">
            Manage your RealtyBoss plan, payment method, and view invoice history.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-1 hidden text-xs font-medium text-gray-400 underline hover:text-gray-600 sm:block"
        >
          Refresh
        </button>
      </div>

      {/* ── Status banners ──────────────────────────────────────────────────── */}
      {canceled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Checkout was canceled — pick a plan when you&apos;re ready.
        </div>
      )}
      {checkoutOk && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Subscription updated — it may take a few seconds for features to unlock everywhere.
        </div>
      )}
      {checkoutErr && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Checkout could not complete ({checkoutErr}). Try again or contact support.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Current subscription card ──────────────────────────────────── */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {/* Accent bar */}
            <div
              className="h-1.5 w-full"
              style={{ background: subscription ? BRAND : "#e2e8f0" }}
            />
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Current plan
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-brand-text capitalize">
                    {subscription ? subscription.plan : "No active plan"}
                  </h2>
                  {subscription && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={subscription.status} />
                      {cancelAtPeriodEnd && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          Cancels at period end
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {subscription && (
                  <div className="text-right">
                    {/* Free tier renders "Free" instead of "$0 per month"
                        — same intent as the tier-card pricing. */}
                    {subscription.tier.price === 0 ? (
                      <p className="text-3xl font-extrabold text-brand-text">Free</p>
                    ) : (
                      <>
                        <p className="text-3xl font-extrabold text-brand-text">
                          ${subscription.tier.price}
                        </p>
                        <p className="text-sm text-gray-500">per month</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Details grid */}
              {subscription && (currentPeriodEnd || paymentMethod) && (
                <div className="mt-5 grid grid-cols-1 gap-4 border-t border-gray-100 pt-5 sm:grid-cols-3">
                  {currentPeriodEnd && (
                    <div>
                      <p className="text-xs text-gray-400">
                        {cancelAtPeriodEnd ? "Cancels on" : "Next billing"}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-brand-text">
                        {fmt(currentPeriodEnd)}
                      </p>
                    </div>
                  )}
                  {paymentMethod && (
                    <div>
                      <p className="text-xs text-gray-400">Payment method</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <CardBrandIcon brand={paymentMethod.brand} />
                        <span className="text-sm font-semibold text-brand-text">
                          •••• {paymentMethod.last4}
                        </span>
                        <span className="text-xs text-gray-400">
                          {String(paymentMethod.expMonth).padStart(2, "0")}/{paymentMethod.expYear}
                        </span>
                      </div>
                    </div>
                  )}
                  {subscription.features.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Included features</p>
                      <ul className="space-y-0.5">
                        {subscription.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5 text-xs text-gray-700">
                            <span className="text-emerald-500">✓</span>
                            {featureLabel(f)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Cancel warning */}
              {cancelAtPeriodEnd && currentPeriodEnd && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Your subscription is set to cancel at the end of the billing period.
                  All features remain available until <strong>{fmt(currentPeriodEnd)}</strong>.
                </div>
              )}

              {/* No subscription */}
              {!subscription && (
                <p className="mt-4 text-sm text-gray-500">
                  No active CRM subscription. Choose a plan below to unlock AI and automation features.
                </p>
              )}

              {/* Portal button */}
              {subscription && (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void openPortal()}
                    disabled={portalLoading}
                    className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
                  >
                    {portalLoading ? "Opening…" : "Manage billing →"}
                  </button>
                  <span className="text-xs text-gray-400">
                    Update card, download invoices, or cancel
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Plan cards ────────────────────────────────────────────────── */}
          <div>
            <h2 className="mb-4 text-lg font-bold text-brand-text">
              {subscription ? "Change plan" : "Choose a plan"}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {tiers.map((slug) => {
                const row = catalog?.[slug];
                const isCurrent = subscription?.plan === slug;
                const price = row?.price;
                /* Tier card driven by the catalog entry — `displayName`,
                   `tagline`, and `popular` come straight from
                   `lib/billing/plans.ts`, so adding/renaming a tier
                   updates the cards automatically. */
                const displayName = row?.displayName ?? slug;
                const tagline = row?.tagline ?? "";
                const popular = row?.popular === true;
                return (
                  <div
                    key={slug}
                    className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition ${
                      isCurrent
                        ? "border-[#0072ce] ring-2 ring-[#0072ce]/20"
                        : "border-gray-200"
                    }`}
                  >
                    {popular && !isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span
                          className="rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm"
                          style={{ background: BRAND }}
                        >
                          Most popular
                        </span>
                      </div>
                    )}
                    {isCurrent && (
                      <span
                        className="absolute right-4 top-4 rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                        style={{ background: BRAND }}
                      >
                        Current
                      </span>
                    )}

                    <p
                      className="text-sm font-semibold"
                      style={{ color: isCurrent ? BRAND : "#6b7280" }}
                    >
                      {displayName}
                    </p>
                    <p className="mt-1 text-3xl font-extrabold text-brand-text">
                      {slug === "team"
                        ? "Custom"
                        : price === 0
                          ? "Free"
                          : price !== undefined
                            ? `$${price}`
                            : "—"}
                      {slug !== "team" && price !== undefined && price > 0 && (
                        <span className="text-base font-normal text-gray-500">/mo</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{tagline}</p>

                    <ul className="mt-4 flex-1 space-y-2 text-sm text-gray-600">
                      {(row?.features ?? []).map((f) => (
                        <li key={f} className="flex items-center gap-2">
                          <span style={{ color: isCurrent ? BRAND : "#6b7280" }}>✓</span>
                          {featureLabel(f)}
                        </li>
                      ))}
                    </ul>

                    {/* Free tier (Starter at $0) has no Stripe Price ID,
                        so the button can't go through checkout — show it
                        as the implicit fallback when no paid sub is
                        active, and disabled otherwise. The catalog's
                        `stripePriceEnvVar: null` is the canonical signal. */}
                    {slug === "team" ? (
                      /* Team is sales-assisted — no self-serve checkout. */
                      <a
                        href="/contact?topic=team"
                        className="mt-6 block w-full rounded-xl py-2.5 text-center text-sm font-bold text-white shadow transition hover:opacity-90"
                        style={{ background: BRAND }}
                      >
                        Contact sales
                      </a>
                    ) : price === 0 ? (
                      <div
                        className="mt-6 w-full rounded-xl bg-slate-100 py-2.5 text-center text-sm font-semibold text-slate-600"
                        aria-disabled
                      >
                        {isCurrent ? "Current plan" : "Free — included by default"}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void startCheckout(slug)}
                        disabled={busyPlan !== null || isCurrent}
                        className="mt-6 w-full rounded-xl py-2.5 text-sm font-bold text-white shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ background: isCurrent ? "#94a3b8" : BRAND }}
                      >
                        {busyPlan === slug
                          ? "Redirecting…"
                          : isCurrent
                            ? "Current plan"
                            : subscription
                              ? "Switch plan"
                              : "Get started"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Payment history ────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-lg font-bold text-brand-text">Payment history</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                Recent charges on your account.
              </p>
            </div>

            {invoices.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Date
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Status
                      </th>
                      <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Receipt
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="transition hover:bg-gray-50/70">
                        <td className="px-6 py-3.5 text-gray-700">{fmt(inv.date)}</td>
                        <td className="px-6 py-3.5 font-semibold text-brand-text">
                          {inv.currency} ${inv.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-3.5">
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={
                              inv.status === "paid"
                                ? { background: "#dcfce7", color: "#166534" }
                                : inv.status === "open"
                                  ? { background: "#fef9c3", color: "#854d0e" }
                                  : { background: "#f1f5f9", color: "#475569" }
                            }
                          >
                            {capitalize(inv.status)}
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          {inv.pdf ? (
                            <a
                              href={inv.pdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium underline hover:no-underline"
                              style={{ color: BRAND }}
                            >
                              Download PDF
                            </a>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-gray-400">No payments yet</p>
                <p className="mt-1 text-xs text-gray-300">
                  Invoices will appear here after your first payment.
                </p>
              </div>
            )}

            <div className="border-t border-gray-100 px-6 py-3">
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalLoading}
                className="text-xs font-medium underline hover:no-underline disabled:opacity-60"
                style={{ color: BRAND }}
              >
                {portalLoading ? "Opening…" : "View all invoices in Stripe portal →"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
