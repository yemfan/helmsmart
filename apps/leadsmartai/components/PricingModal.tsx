"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandCheck, toneAt } from "@/components/brand/BrandCheck";
import { PRICING_TRIAL_CHECKOUT_PATH, loginUrl } from "@/lib/loginUrl";
import { mergeAuthHeaders } from "@/lib/mergeAuthHeaders";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type PlanKey = "free" | "pro" | "premium";

const plans: {
  key: PlanKey;
  title: string;
  price: string;
  subtitle: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}[] = [
  {
    // `key` stays "free" — internal plan_type identifier used across ~60 sites.
    key: "free",
    title: "Starter",
    price: "$0/mo",
    subtitle: "Limited functions and usages",
    features: [
      "CMA Reports: 2/day",
      "Lead Management: Limited",
      "Alerts: Basic",
      "CRM Access: No",
      "Reports Download: Limited",
      "Team Access: No",
      "Bookkeeping: No",
      "AI Calling: No",
    ],
    cta: "Get Started",
  },
  {
    key: "pro",
    title: "Pro Agent",
    price: "$79/mo",
    subtitle: "For active solo agents",
    features: [
      "CMA Reports: 5/day",
      "Lead Management: Up to 500 leads",
      "Alerts: Full + engagement tracking",
      "CRM Access: Yes",
      "Reports Download: Full",
      "Team Access: No",
      "Bookkeeping: Invoices & expenses",
      "AI Calling: No",
    ],
    cta: "Start Pro",
    highlighted: true,
  },
  {
    key: "premium",
    title: "Premium",
    price: "$199/mo",
    subtitle: "For top producers running solo",
    features: [
      "CMA Reports: 10/day (expandable)",
      "Lead Management: Unlimited",
      "Alerts: Advanced + automation",
      "CRM Access: Full",
      "Reports Download: Unlimited",
      "Top Producer Track coaching included",
      "Bookkeeping: Invoices & expenses",
      "AI Calling: Receptionist + Concierge",
    ],
    cta: "Upgrade to Premium",
  },
];

export default function PricingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState<PlanKey | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [planInfo, setPlanInfo] = useState<{
    plan: string;
    access: string;
    subscription_status: string;
    trial_used: boolean;
  } | null>(null);

  const [leadUsage, setLeadUsage] = useState<{
    count: number;
    limit: number | null;
    plan: string;
  } | null>(null);

  const [cmaUsage, setCmaUsage] = useState<{
    used: number;
    limit: number;
    reached: boolean;
    warning: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDynamic() {
      if (!open) return;
      setError(null);
      try {
        const [planRes, leadsRes, cmaRes] = await Promise.all([
          fetch("/api/check-plan", { method: "POST", credentials: "include" }),
          fetch("/api/leads/count", { credentials: "include" }),
          fetch("/api/cma/check-limit", { method: "POST", credentials: "include" }),
        ]);

        const planJson = (await planRes.json().catch(() => ({}))) as any;
        const leadsJson = (await leadsRes.json().catch(() => ({}))) as any;
        const cmaJson = (await cmaRes.json().catch(() => ({}))) as any;

        if (cancelled) return;

        if (planRes.ok && planJson?.ok) {
          setPlanInfo({
            plan: String(planJson.plan ?? "free"),
            access: String(planJson.access ?? "limited"),
            subscription_status: String(planJson.subscription_status ?? "inactive"),
            trial_used: Boolean(planJson.trial_used ?? false),
          });
        }

        if (leadsRes.ok && leadsJson?.ok) {
          setLeadUsage({
            count: Number(leadsJson.count ?? 0),
            limit: leadsJson.limit == null ? null : Number(leadsJson.limit),
            plan: String(leadsJson.plan ?? "free"),
          });
        }

        if (cmaRes.ok && cmaJson?.ok) {
          setCmaUsage({
            used: Number(cmaJson?.usage?.used ?? 0),
            limit: Number(cmaJson?.usage?.limit ?? 0),
            reached: Boolean(cmaJson?.usage?.reached ?? false),
            warning: Boolean(cmaJson?.usage?.warning ?? false),
          });
        }
      } catch {
        // best effort
      }
    }

    loadDynamic();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const isGuest = planInfo?.subscription_status?.toLowerCase() === "guest";

  const leadsPct = useMemo(() => {
    if (!leadUsage || leadUsage.limit == null || leadUsage.limit <= 0) return 0;
    return Math.min(100, Math.round((leadUsage.count / leadUsage.limit) * 100));
  }, [leadUsage]);

  async function requireAuthOrRedirect(redirectTo: string) {
    if (!isGuest) return true;
    router.push(`/login?redirect=${encodeURIComponent(redirectTo)}`);
    onClose();
    return false;
  }

  async function startTrial() {
    setError(null);
    const {
      data: { session },
    } = await supabaseBrowser().auth.getSession();
    if (!session) {
      router.push(loginUrl({ redirect: PRICING_TRIAL_CHECKOUT_PATH, reason: "trial" }));
      onClose();
      return;
    }
    if (!(await requireAuthOrRedirect(PRICING_TRIAL_CHECKOUT_PATH))) return;
    setTrialLoading(true);
    try {
      const headers = await mergeAuthHeaders();
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ plan: "pro", with_trial: true, cancel_surface: "agent" }),
      });
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body?.error || "Failed to open checkout");
      if (!body.url) throw new Error("Missing checkout url");
      window.location.href = body.url;
    } catch (e: any) {
      setError(e?.message ?? "Could not open trial checkout");
    } finally {
      setTrialLoading(false);
    }
  }

  async function startCheckout(plan: "pro" | "premium") {
    setError(null);
    setLoading(plan);
    try {
      const {
        data: { session },
      } = await supabaseBrowser().auth.getSession();
      if (!session) {
        setLoading(null);
        router.push(loginUrl({ redirect: "/agent/pricing", reason: "checkout" }));
        onClose();
        return;
      }
      if (!(await requireAuthOrRedirect("/agent/pricing"))) {
        setLoading(null);
        return;
      }
      const headers = await mergeAuthHeaders();
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers,
        body: JSON.stringify({ plan, cancel_surface: "agent" }),
        credentials: "include",
      });
      const raw = await res.text();
      let body: { error?: string; url?: string } = {};
      try {
        body = raw ? (JSON.parse(raw) as typeof body) : {};
      } catch {
        body = { error: raw.slice(0, 200) || `Request failed (${res.status})` };
      }
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" && body.error.length > 0
            ? body.error
            : `Checkout failed (${res.status})`
        );
      }
      if (!body.url) throw new Error("Missing checkout URL — check Stripe configuration.");
      window.location.assign(body.url);
    } catch (e: any) {
      setError(e?.message ?? "Checkout failed");
      setLoading(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-3">
      <div className="w-full max-w-5xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900">Upgrade your plan</div>
            <div className="text-xs text-slate-600 mt-1">
              Grow faster with unlimited lead generation and agent-ready automation.
            </div>
            {leadUsage?.limit != null ? (
              <div className="text-[11px] text-slate-500 mt-2">
                Leads: {leadUsage.count}/{leadUsage.limit} ({leadsPct}%)
              </div>
            ) : null}
            {cmaUsage ? (
              <div className="text-[11px] text-slate-500 mt-1">
                CMA today: {cmaUsage.used}/{cmaUsage.limit} {cmaUsage.reached ? " (reached)" : ""}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="text-sm font-semibold px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-5">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}

          {/* Lead/CMA reached messages */}
          {leadUsage?.limit != null && leadsPct >= 100 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              You’ve reached your CMA or Lead limit. Upgrade to Premium for unlimited access.
            </div>
          ) : null}

          {cmaUsage?.reached ? (
            <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
              You’ve reached your CMA limit. Upgrade to Premium for unlimited access.
            </div>
          ) : null}

          {/* Plans */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((p) => (
              <div
                key={p.key}
                className={`rounded-2xl border bg-white shadow-sm p-6 ${
                  p.highlighted ? "border-blue-200 ring-2 ring-blue-100" : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{p.title}</div>
                  {p.highlighted ? (
                    <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-1">
                      Most Popular
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 text-3xl font-bold text-gray-900">{p.price}</div>
                <div className="mt-1 text-xs text-gray-500">{p.subtitle}</div>

                <ul className="mt-5 space-y-2 text-sm text-gray-700">
                  {p.features.map((f, i) => (
                    <li key={f} className="flex items-start gap-2">
                      <BrandCheck tone={toneAt(i)} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {p.key === "free" ? (
                    <button
                      type="button"
                      onClick={startTrial}
                      disabled={trialLoading || Boolean(planInfo?.trial_used)}
                      className="w-full rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 disabled:opacity-60"
                    >
                      {trialLoading ? "Starting..." : "Start 7-day free trial"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startCheckout(p.key === "pro" ? "pro" : "premium")}
                      disabled={loading === p.key}
                      className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 disabled:opacity-60"
                    >
                      {loading === p.key ? "Redirecting..." : p.cta}
                    </button>
                  )}
                </div>

                {p.key === "pro" && leadUsage?.limit != null ? (
                  <div className="mt-3 text-[11px] text-amber-700 font-medium">
                    Pro lead cap is {leadUsage.limit}. Upgrade to Premium for unlimited access.
                  </div>
                ) : p.key === "pro" ? (
                  <div className="mt-3 text-[11px] text-amber-700 font-medium">
                    Upgrade to Premium for unlimited growth.
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Need more?</p>
            <p className="mt-1 text-slate-600">
              <strong>Signature</strong> ($399/mo) adds bilingual English / 中文 AI, Sphere
              Intelligence Pro, white-glove onboarding, and concierge support.{" "}
              <strong>Team</strong> ($299/mo per team) adds round-robin routing and shared
              workflows for up to 5 agents.{" "}
              <a href="/agent/pricing" className="font-semibold text-blue-700 hover:underline">
                See the full ladder →
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

