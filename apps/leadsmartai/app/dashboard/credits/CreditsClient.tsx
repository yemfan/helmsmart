"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CREDIT_TIERS, CREDIT_PACKS } from "@/lib/credits/pricing";

const BRAND = "#0072CE";

/** Mirrors CurrentPlan from lib/credits/currentPlan (planId null = pay-as-you-go). */
type CurrentPlan = {
  planId: string | null;
  name: string;
  priceUsd: number | null;
  monthlyCredits: number | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  status: string | null;
};

function fmtDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export default function CreditsClient() {
  // Named `tr` — the plan rows below already bind `t` to a tier.
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const sp = useSearchParams();
  const topup = sp?.get("topup"); // "success" | "canceled"
  const checkout = sp?.get("checkout"); // "success" (subscription)

  const [balance, setBalance] = useState<number | null>(null);
  const [plan, setPlan] = useState<CurrentPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const loadBalance = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard/credits", { credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as { credits?: number; plan?: CurrentPlan | null };
      if (typeof j.credits === "number") setBalance(j.credits);
      if (j.plan) setPlan(j.plan);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  async function openPortal() {
    setPortalBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/billing/portal", { method: "POST", credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error || tr("more.credits.portalFailed"));
      window.location.href = j.url;
    } catch (e) {
      showError(e instanceof Error ? e.message : tr("more.credits.portalFailed"));
      setPortalBusy(false);
    }
  }

  // Surface an error where the user can see it — the banner is at the top of the
  // page, so scroll it into view (the buy/subscribe buttons are far below it).
  function showError(message: string) {
    setError(message);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function go(url: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        switched?: boolean;
        message?: string;
      };
      if (!r.ok) throw new Error(j.error || tr("more.credits.checkoutFailed"));

      // Existing subscribers change plan in place (prorated) — no checkout trip.
      if (j.switched) {
        setNotice(j.message || tr("more.credits.planChanged"));
        setBusy(null);
        await loadBalance();
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (!j.url) throw new Error(j.error || tr("more.credits.checkoutFailed"));
      window.location.href = j.url;
    } catch (e) {
      showError(e instanceof Error ? e.message : tr("more.credits.checkoutFailed"));
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
            <h1 className="text-2xl font-bold tracking-tight text-brand-text">{tr("more.credits.title")}</h1>
            <p className="mt-1 text-sm text-brand-text/60">
              Everything&apos;s included — you only spend credits on calls, video, and image generation.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{tr("more.credits.balance")}</p>
            <p className="text-3xl font-extrabold text-brand-text">
              {balance === null ? "…" : balance.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Current plan — the app should be able to answer "what am I on?" */}
        {plan && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{tr("more.credits.currentPlan")}</p>
              <p className="mt-0.5 text-lg font-bold text-brand-text">
                {plan.name}
                {plan.priceUsd !== null && (
                  <span className="ml-1 text-sm font-normal text-gray-500">${plan.priceUsd}/mo</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {plan.planId === null ? (
                  <>{tr("more.credits.paygHelp")}</>
                ) : plan.cancelAtPeriodEnd && plan.renewsAt ? (
                  <>Ends {fmtDate(plan.renewsAt, locale)} — credits you already have stay yours.</>
                ) : (
                  <>
                    {plan.monthlyCredits?.toLocaleString()} credits / mo
                    {plan.renewsAt ? <> · renews {fmtDate(plan.renewsAt, locale)}</> : null}
                  </>
                )}
              </p>
            </div>
            {plan.planId !== null && (
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalBusy}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
              >
                {portalBusy ? "Opening…" : tr("more.credits.managePlan")}
              </button>
            )}
          </div>
        )}
      </div>

      {topup === "success" && (
        <Banner tone="ok">Credits added — your new balance should appear in a moment.</Banner>
      )}
      {topup === "canceled" && <Banner tone="warn">{tr("more.credits.canceled")}</Banner>}
      {checkout === "success" && (
        <Banner tone="ok">Subscription updated — your monthly credits will appear shortly.</Banner>
      )}
      {notice && <Banner tone="ok">{notice}</Banner>}
      {error && <Banner tone="err">{error}</Banner>}

      {/* Monthly plans */}
      <section>
        <h2 className="mb-1 text-lg font-bold text-brand-text">{tr("more.credits.monthlyPlans")}</h2>
        <p className="mb-4 text-sm text-gray-500">
          {tr("more.credits.monthlyHelp")}
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {CREDIT_TIERS.map((t) => {
            const isCurrent = plan?.planId === t.id;
            // Rank by credit allotment so the button says what the change is.
            const currentTier = CREDIT_TIERS.find((x) => x.id === plan?.planId);
            const label = isCurrent
              ? tr("more.credits.currentPlan")
              : !currentTier
                ? tr("more.credits.subscribe")
                : t.monthlyCredits > currentTier.monthlyCredits
                  ? tr("more.credits.upgrade")
                  : tr("more.credits.downgrade");
            return (
              <div
                key={t.id}
                className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
                  isCurrent ? "border-[#0072ce] ring-2 ring-[#0072ce]/20" : "border-gray-200"
                }`}
              >
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
                  disabled={busy !== null || isCurrent}
                  className="mt-5 w-full rounded-xl py-2.5 text-sm font-bold text-white shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: isCurrent ? "#94a3b8" : BRAND }}
                >
                  {busy === `plan:${t.id}` ? "Working…" : label}
                </button>
              </div>
            );
          })}
        </div>
        {plan?.planId && (
          <p className="mt-3 text-xs text-gray-500">
            Switching plans only bills the difference for the rest of your billing period. Downgrades keep
            the credits you&apos;ve already been given.
          </p>
        )}
        <p className="mt-3 text-xs text-gray-500">
          {tr("more.credits.teamPrompt")}{" "}
          <a href="/contact?topic=team" className="font-medium underline" style={{ color: BRAND }}>
            Contact us about Brokerage
          </a>{" "}
          for multiple agents + pooled credits.
        </p>
      </section>

      {/* Top-up packs */}
      <section>
        <h2 className="mb-1 text-lg font-bold text-brand-text">{tr("more.credits.topUpPacks")}</h2>
        <p className="mb-4 text-sm text-gray-500">
          {tr("more.credits.topUpHelp")}
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {CREDIT_PACKS.map((p) => (
            <div key={p.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-2xl font-extrabold text-brand-text">{p.credits.toLocaleString()}</p>
              <p className="text-xs text-gray-500">{tr("more.credits.creditsUnit")}</p>
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

      {/* Manage billing / invoices (Stripe portal) */}
      <div className="border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => void openPortal()}
          disabled={portalBusy}
          className="text-xs font-medium underline hover:no-underline disabled:opacity-60"
          style={{ color: BRAND }}
        >
          {portalBusy ? tr("more.credits.opening") : tr("more.credits.manageBilling")}
        </button>
      </div>
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
