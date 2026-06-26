"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";
import { messageFromUnknownError } from "@/lib/supabaseThrow";
import type { AgentPlanId } from "@/lib/entitlements/types";
import type { BillingCadence, PlanSlug } from "@/lib/billing/plans";

type CheckoutSlug = Exclude<PlanSlug, "starter" | "team">;

const PLANS: {
  /** Entitlements-side plan id (drives the catalog lookup). */
  id: AgentPlanId;
  /** New CRM-checkout slug — passed to /api/billing/crm/checkout when paid. */
  checkoutSlug?: CheckoutSlug;
  monthly: number;
  annual: number | null;
  subtitle: string;
  featured?: boolean;
  signatureLook?: boolean;
}[] = [
  { id: "starter", monthly: 0, annual: null, subtitle: "Get started instantly" },
  {
    id: "growth",
    checkoutSlug: "pro",
    monthly: 49,
    annual: 490,
    subtitle: "14-day free trial",
    featured: true,
  },
  {
    id: "elite",
    checkoutSlug: "premium",
    monthly: 99,
    annual: 990,
    subtitle: "14-day free trial",
  },
  {
    id: "signature",
    checkoutSlug: "signature",
    monthly: 249,
    annual: 2490,
    subtitle: "14-day free trial · bilingual + concierge",
    signatureLook: true,
  },
];

function annualMo(annual: number): number {
  return Math.round((annual / 12) * 100) / 100;
}

export default function StartFreeAgentClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cadence, setCadence] = useState<BillingCadence>("monthly");

  async function handleStarter() {
    setError(null);
    setLoading("starter");
    try {
      const res = await fetch("/api/agent/start-free", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      });
      const json = (await res.json()) as { ok?: boolean; success?: boolean; error?: unknown; redirectTo?: string };
      if (!res.ok || !(json.ok ?? json.success)) {
        throw new Error(messageFromUnknownError(json.error, "Could not activate. Try again."));
      }
      router.push(json.redirectTo || "/agent/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(null);
    }
  }

  async function handlePaid(slug: CheckoutSlug) {
    setError(null);
    setLoading(slug);
    try {
      const res = await fetch("/api/billing/crm/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, cadence, with_trial: true }),
      });
      const json = (await res.json()) as { url?: string; ok?: boolean; success?: boolean; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Could not start checkout. Try again.");
      }
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(null);
    }
  }

  function handleSelect(plan: (typeof PLANS)[number]) {
    if (plan.checkoutSlug) {
      void handlePaid(plan.checkoutSlug);
    } else {
      void handleStarter();
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Welcome to RealtyBoss
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Choose your plan
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
          Pick a plan to unlock RealtyBoss — pipeline, AI tools, and coaching. Start free or go
          straight to a paid plan with a 14-day trial (cancel anytime). Available in English and
          中文.
        </p>

        {/* Cadence toggle */}
        <div className="mt-6 inline-flex rounded-full border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setCadence("monthly")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              cadence === "monthly" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCadence("annual")}
            className={`ml-1 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              cadence === "annual" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Annual
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                cadence === "annual" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
              }`}
            >
              Save 17%
            </span>
          </button>
        </div>

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-4">
          {PLANS.map((plan) => {
            const catalog = PLAN_CATALOG[plan.id];
            const isLoading =
              loading === plan.id || (plan.checkoutSlug ? loading === plan.checkoutSlug : false);
            const isSignature = !!plan.signatureLook;

            const containerCls = isSignature
              ? "flex flex-col rounded-2xl border border-amber-300 bg-[#0b1e3f] p-6 text-slate-100 shadow-lg ring-1 ring-amber-300/40"
              : plan.featured
                ? "flex flex-col rounded-2xl border border-slate-900 bg-white p-6 shadow-sm ring-2 ring-slate-900/10"
                : "flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

            const titleCls = isSignature ? "text-lg font-semibold text-white" : "text-lg font-semibold text-slate-900";
            const priceCls = isSignature ? "text-2xl font-bold tracking-tight text-white" : "text-2xl font-bold tracking-tight text-slate-900";
            const subCls = isSignature ? "mt-1 text-xs text-slate-300" : "mt-1 text-xs text-slate-500";
            const bulletCls = isSignature ? "text-sm text-slate-200" : "text-sm text-slate-700";
            const ctaCls = isSignature
              ? "bg-amber-300 text-amber-950 hover:bg-amber-200"
              : plan.featured
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50";

            const priceLabel =
              plan.monthly === 0
                ? "Free"
                : cadence === "annual" && plan.annual != null
                  ? `$${annualMo(plan.annual)}/mo`
                  : `$${plan.monthly}/mo`;
            const priceSubLabel =
              plan.monthly === 0
                ? null
                : cadence === "annual" && plan.annual != null
                  ? `$${plan.annual} billed yearly · save $${plan.monthly * 2}`
                  : "Billed monthly";

            return (
              <div key={plan.id} className={containerCls}>
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <h3 className={titleCls}>{catalog.label}</h3>
                    <div className={`mt-1 ${priceCls}`}>{priceLabel}</div>
                    <p className={subCls}>{priceSubLabel ?? plan.subtitle}</p>
                  </div>
                  {plan.featured && !isSignature && (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Popular
                    </span>
                  )}
                  {isSignature && (
                    <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                      Bilingual & Luxury
                    </span>
                  )}
                </div>

                <ul className="mt-5 flex-1 space-y-2">
                  {catalog.bullets.map((b) => (
                    <li key={b} className={`flex gap-2 ${bulletCls}`}>
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${isSignature ? "text-amber-300" : "text-emerald-600"}`}
                        aria-hidden
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={!!loading}
                  onClick={() => handleSelect(plan)}
                  className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition disabled:opacity-60 ${ctaCls}`}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <>
                      {plan.checkoutSlug ? "Start 14-day trial" : "Get started free"}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-slate-500">
          All paid plans include a 14-day free trial. Cancel anytime. Need a team plan?{" "}
          <Link href="/contact?topic=team" className="font-semibold text-blue-700 hover:text-blue-800">
            Contact sales for Team ($299/mo)
          </Link>
          .
        </p>

        <div className="mt-4 text-center text-sm text-slate-600">
          Questions? See{" "}
          <Link href="/agent/pricing" className="font-semibold text-blue-700 hover:text-blue-800">
            full pricing details
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
