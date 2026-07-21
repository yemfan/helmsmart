"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, Loader2 } from "lucide-react";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import { PLANS, type PlanSlug } from "@/lib/billing/plans";
import type { AgentPlanId } from "@/lib/entitlements/types";
import type { PlanCatalogEntry } from "@/lib/entitlements/planCatalog";

const ORDER: AgentPlanId[] = ["starter", "pro", "premium"];

// Entitlement slug → billing slug. The displayed price is derived from the
// PLANS catalog (single source of truth) so it never drifts from checkout.
const PLAN_CHECKOUT: Record<string, { plan: PlanSlug } | null> = {
  starter: null,
  pro: { plan: "pro" },
  premium: { plan: "premium" },
  signature: { plan: "signature" },
  team: { plan: "team" },
};

function PlanCard({
  id,
  entry,
  highlight,
  onUpgrade,
  upgrading,
}: {
  id: AgentPlanId;
  entry: PlanCatalogEntry;
  highlight?: boolean;
  onUpgrade: (checkoutPlan: string) => void;
  upgrading: string | null;
}) {
  const checkout = PLAN_CHECKOUT[id];
  const isUpgrading = checkout ? upgrading === checkout.plan : false;

  return (
    <div
      className={`flex flex-col rounded-2xl border p-6 shadow-sm ${
        highlight ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">{entry.label}</h3>
        {highlight ? (
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Popular
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {id === "starter" && "Entry workspace"}
        {id === "pro" && "Scaling teams"}
        {id === "premium" && "Unlimited scale + team"}
      </p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {entry.bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {checkout ? (
        <button
          type="button"
          disabled={!!upgrading}
          onClick={() => onUpgrade(checkout.plan)}
          className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60 ${
            highlight
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
          }`}
        >
          {isUpgrading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <>
              Upgrade to {entry.label} &mdash; {`$${PLANS[checkout.plan].price}/mo`}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
      ) : (
        <div className="mt-6 text-center text-xs font-medium text-slate-400">
          Current free tier
        </div>
      )}

      <div className="mt-4 text-xs text-slate-500">
        Upgrade path:{" "}
        <span className="font-medium text-slate-700">
          Starter &rarr; Pro &rarr; Premium (higher caps + team)
        </span>
      </div>
    </div>
  );
}

export function AgentPricingComparison() {
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(checkoutPlan: string) {
    setError(null);
    setUpgrading(checkoutPlan);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: checkoutPlan, cancel_surface: "agent" }),
      });
      const json = (await res.json()) as { url?: string; ok?: boolean; success?: boolean; error?: string };
      const ok = json.ok ?? json.success;
      if (!res.ok || !ok || !json.url) {
        setError(json.error ?? "Could not start checkout. Please try again.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setUpgrading(null);
    }
  }

  return (
    <section id="plans" className="scroll-mt-24">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">Agent plans & limits</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Every tier unlocks the same CloseBoss Agent workspace — limits scale with your plan. Start on Starter, move
        to Pro for pipeline volume, and Premium when you need automation + team seats.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {ORDER.map((id) => (
          <PlanCard
            key={id}
            id={id}
            entry={PLAN_CATALOG[id]}
            highlight={id === "pro"}
            onUpgrade={handleUpgrade}
            upgrading={upgrading}
          />
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-slate-600">
        Need bilingual or luxury concierge? See <strong>Signature</strong> ($399/mo) and{" "}
        <strong>Team</strong> ($299/mo) on the{" "}
        <Link href="/agent/pricing" className="font-semibold text-blue-700 hover:text-blue-800">
          full pricing page →
        </Link>
      </p>
    </section>
  );
}
