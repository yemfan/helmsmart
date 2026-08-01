"use client";

import { useState } from "react";
import { formatPrice, type CreditPack } from "@/lib/billing";

export default function BuyCredits({
  packs,
  configured,
}: {
  packs: CreditPack[];
  configured: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(packId: string) {
    if (loading) return;
    setError(null);
    setLoading(packId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || `Checkout failed (${res.status})`);
      window.location.href = data.url; // hand off to Stripe's hosted checkout
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!configured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-200">
          Card payments aren&apos;t switched on yet. Buttons will work once billing is configured.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-200">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className={`relative flex flex-col rounded-2xl border p-5 ${
              pack.popular
                ? "border-boss-gold/50 bg-boss-gold/[0.06]"
                : "border-white/10 bg-ink-2/70"
            }`}
          >
            {pack.popular && (
              <span className="absolute -top-2.5 left-5 rounded-full bg-boss-gold px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                Best value
              </span>
            )}
            <h3 className="text-lg font-bold">{pack.name}</h3>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-boss-gold">{pack.credits}</span>
              <span className="text-sm text-white/50">credits</span>
            </div>
            <p className="mt-2 min-h-10 text-xs leading-relaxed text-white/50">{pack.blurb}</p>
            <button
              onClick={() => buy(pack.id)}
              disabled={!configured || loading !== null}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-boss-gold px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading === pack.id ? "Redirecting…" : `Buy — ${formatPrice(pack.priceCents)}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
