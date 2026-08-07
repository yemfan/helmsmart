"use client";

import { useState } from "react";
import Connections from "@/components/Connections";
import BuyCredits from "@/components/BuyCredits";
import type { CreditPack } from "@/lib/billing";

/**
 * One place for every MarketingBoss configuration — social Connections and
 * Billing & credits — behind a tab bar. Deep-linkable via ?tab=connections|billing
 * (used by the top-nav Settings link and the credits pill).
 */

type Tab = "connections" | "billing";

const TABS: { id: Tab; label: string }[] = [
  { id: "connections", label: "Connections" },
  { id: "billing", label: "Billing & credits" },
];

export default function SettingsTabs({
  initialTab,
  stripeStatus,
  connections,
  billing,
}: {
  initialTab: Tab;
  stripeStatus: string | null;
  connections: { providersConfigured: Record<string, boolean>; statuses: Record<string, { connected: boolean; accountName: string | null }> };
  billing: { packs: CreditPack[]; configured: boolean };
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

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
        <section className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            Pay-as-you-go — no subscription. Credits never expire. Image = 1 credit · edit = 2 · video = 20.
          </p>
          {stripeStatus === "cancel" && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-600">
              Checkout canceled — no charge was made.
            </div>
          )}
          <BuyCredits packs={billing.packs} configured={billing.configured} />
          <p className="text-[11px] text-slate-400">Secure payments by Stripe · every render is saved to your gallery.</p>
        </section>
      )}
    </div>
  );
}
