"use client";

import { useState } from "react";
import Connections from "@/components/Connections";
import BuyCredits from "@/components/BuyCredits";
import BrandKitForm from "@/components/BrandKitForm";
import VoiceCloneCard from "@/components/VoiceCloneCard";
import { formatPrice, type CreditPack, type SubscriptionPlan } from "@/lib/billing";
import type { BrandKit } from "@/lib/brandKit";

/**
 * One place for every MarketingBoss configuration — Brand Kit, social
 * Connections, and Billing & credits — behind a tab bar. Deep-linkable via
 * ?tab=brand|connections|billing (used by the top-nav Settings link and the
 * credits pill).
 */

type Tab = "brand" | "voice" | "connections" | "billing";

const TABS: { id: Tab; label: string }[] = [
  { id: "brand", label: "Brand Kit" },
  { id: "voice", label: "Your voice" },
  { id: "connections", label: "Connections" },
  { id: "billing", label: "Billing & credits" },
];

export default function SettingsTabs({
  initialTab,
  stripeStatus,
  uid,
  brand,
  voiceCloning,
  connections,
  billing,
}: {
  initialTab: Tab;
  stripeStatus: string | null;
  uid: string;
  brand: BrandKit | null;
  /** Whether voice cloning is switched on — the card explains itself when not. */
  voiceCloning: boolean;
  connections: { providersConfigured: Record<string, boolean>; statuses: Record<string, { connected: boolean; accountName: string | null }> };
  billing: {
    packs: CreditPack[];
    configured: boolean;
    plans: SubscriptionPlan[];
    currentPlan: { plan: string | null; status: string | null } | null;
  };
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [subError, setSubError] = useState<string | null>(null);

  async function subscribe(planId: string) {
    if (subscribing) return;
    setSubscribing(planId);
    setSubError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setSubError(body.error ?? "Couldn't start checkout.");
        return;
      }
      window.location.href = body.url;
    } catch {
      setSubError("Network error.");
    } finally {
      setSubscribing(null);
    }
  }

  const select = (t: Tab) => {
    setTab(t);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      url.searchParams.delete("status");
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => select(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-boss-violet text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "brand" && <BrandKitForm uid={uid} initial={brand} />}

      {tab === "voice" && <VoiceCloneCard configured={voiceCloning} />}

      {tab === "connections" && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            Connect your social accounts to publish generated content directly from the Studio. Tokens are stored
            securely and never leave the server.
          </p>
          <Connections
            providersConfigured={connections.providersConfigured}
            statuses={connections.statuses}
          />
          <p className="text-[11px] text-slate-400">Each platform stays hidden until its app credentials are configured.</p>
        </section>
      )}

      {tab === "billing" && (
        <section className="flex flex-col gap-6">
          {stripeStatus === "cancel" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-600">
              Checkout canceled — no charge was made.
            </div>
          )}

          {/* Monthly plans */}
          {billing.configured && billing.plans.length > 0 && (
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Monthly plans</h3>
                <p className="text-xs text-slate-500">
                  Credits every month at a better rate — best for regular posting.
                  {billing.currentPlan?.plan && billing.currentPlan.status === "active" && (
                    <span className="ml-1 font-medium text-emerald-600">
                      Current plan: {billing.currentPlan.plan}.
                    </span>
                  )}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {billing.plans.map((plan) => {
                  const active = billing.currentPlan?.plan === plan.id && billing.currentPlan?.status === "active";
                  return (
                    <div
                      key={plan.id}
                      className={`flex flex-col rounded-2xl border bg-white p-5 ${
                        plan.popular ? "border-boss-violet ring-1 ring-boss-violet" : "border-slate-200"
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">
                        {formatPrice(plan.priceCents)}
                        <span className="text-sm font-medium text-slate-400">/mo</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{plan.creditsPerMonth.toLocaleString()} credits / month</p>
                      <p className="mt-2 flex-1 text-xs text-slate-500">{plan.blurb}</p>
                      <button
                        type="button"
                        onClick={() => void subscribe(plan.id)}
                        disabled={subscribing !== null || active}
                        className="mt-3 rounded-xl bg-boss-violet px-4 py-2 text-sm font-semibold text-white transition hover:bg-boss-violet-600 disabled:opacity-50"
                      >
                        {active ? "Current plan" : subscribing === plan.id ? "…" : `Subscribe`}
                      </button>
                    </div>
                  );
                })}
              </div>
              {subError && <p className="text-xs text-red-600">{subError}</p>}
            </div>
          )}

          {/* One-time top-ups */}
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Top up as you go</h3>
              <p className="text-xs text-slate-500">
                One-time credit packs — no subscription. Credits never expire. Image = 1 · edit = 2 · video = 20.
              </p>
            </div>
            <BuyCredits packs={billing.packs} configured={billing.configured} />
          </div>

          <p className="text-[11px] text-slate-400">Secure payments by Stripe · every render is saved to your gallery.</p>
        </section>
      )}
    </div>
  );
}
