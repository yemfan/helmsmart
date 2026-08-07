"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CREDIT_TIERS, CREDIT_PACKS } from "@/lib/credits/pricing";

const BRAND = "#0072CE";

export default function CreditsClient() {
  const sp = useSearchParams();
  const topup = sp?.get("topup"); // "success" | "canceled"
  const checkout = sp?.get("checkout"); // "success" (subscription)

  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard/credits", { credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as { credits?: number };
      if (typeof j.credits === "number") setBalance(j.credits);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  async function go(url: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error || "Checkout couldn't start.");
      window.location.href = j.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout couldn't start.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">
      {/* Header + balance */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="h-1.5 w-full" style={{ background: BRAND }} />
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-brand-text">Credits</h1>
            <p className="mt-1 text-sm text-brand-text/60">
              Everything&apos;s included — you only spend credits on calls, video, and image generation.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Balance</p>
            <p className="text-3xl font-extrabold text-brand-text">
              {balance === null ? "…" : balance.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {topup === "success" && (
        <Banner tone="ok">Credits added — your new balance should appear in a moment.</Banner>
      )}
      {topup === "canceled" && <Banner tone="warn">Top-up canceled — no charge was made.</Banner>}
      {checkout === "success" && (
        <Banner tone="ok">Subscription updated — your monthly credits will appear shortly.</Banner>
      )}
      {error && <Banner tone="err">{error}</Banner>}

      {/* Monthly plans */}
      <section>
        <h2 className="mb-1 text-lg font-bold text-brand-text">Monthly plans</h2>
        <p className="mb-4 text-sm text-gray-500">
          A credit allotment every month at the best per-credit rate. One seat, everything included.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {CREDIT_TIERS.map((t) => (
            <div key={t.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold" style={{ color: BRAND }}>
                {t.name}
              </p>
              <p className="mt-1 text-3xl font-extrabold text-brand-text">
                ${t.priceUsd}
                <span className="text-base font-normal text-gray-500">/mo</span>
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-700">
                {t.monthlyCredits.toLocaleString()} credits / mo
              </p>
              <p className="mt-1 flex-1 text-xs text-gray-500">{t.blurb}</p>
              <button
                type="button"
                onClick={() => void go("/api/stripe/checkout", { plan: t.id }, `plan:${t.id}`)}
                disabled={busy !== null}
                className="mt-5 w-full rounded-xl py-2.5 text-sm font-bold text-white shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: BRAND }}
              >
                {busy === `plan:${t.id}` ? "Redirecting…" : "Subscribe"}
              </button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Running a team?{" "}
          <a href="/contact?topic=team" className="font-medium underline" style={{ color: BRAND }}>
            Contact us about Brokerage
          </a>{" "}
          for multiple agents + pooled credits.
        </p>
      </section>

      {/* Top-up packs */}
      <section>
        <h2 className="mb-1 text-lg font-bold text-brand-text">Top-up packs</h2>
        <p className="mb-4 text-sm text-gray-500">
          Need more this month? Buy credits any time — no commitment. They never expire.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {CREDIT_PACKS.map((p) => (
            <div key={p.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-2xl font-extrabold text-brand-text">{p.credits.toLocaleString()}</p>
              <p className="text-xs text-gray-500">credits</p>
              <p className="mt-3 flex-1 text-lg font-bold text-brand-text">${p.priceUsd}</p>
              <button
                type="button"
                onClick={() => void go("/api/credits/topup", { packId: p.id }, `pack:${p.id}`)}
                disabled={busy !== null}
                className="mt-4 w-full rounded-xl border py-2.5 text-sm font-bold shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: BRAND, color: BRAND }}
              >
                {busy === `pack:${p.id}` ? "Redirecting…" : "Buy"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Banner({ tone, children }: { tone: "ok" | "warn" | "err"; children: React.ReactNode }) {
  const style =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-red-200 bg-red-50 text-red-900";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${style}`}>{children}</div>;
}
