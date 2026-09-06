"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InternalPlan as BillingPlan } from "@/lib/billing/stripe-plan-map";

type LoanBrokerPlan = "starter" | "pro";

type BillingResponse = {
  success: true;
  billing: {
    plan: BillingPlan;
    status: string;
  } | null;
};

const PLANS: Array<{
  key: LoanBrokerPlan;
  billingPlan?: BillingPlan;
  name: string;
  price: string;
  priceId?: string;
  featureCount: number;
  featured?: boolean;
}> = [
  { key: "starter", name: "Starter", price: "Free", featureCount: 5 },
  {
    key: "pro",
    billingPlan: "loan_broker_pro",
    name: "Pro",
    price: "$99/mo",
    priceId: "price_loan_broker_pro",
    featureCount: 5,
    featured: true,
  },
];

export default function LoanBrokerPricingClientPage() {
  const { t } = useTranslation("dashboard");
  const [currentPlan, setCurrentPlan] = useState<BillingPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState("");
  const [error, setError] = useState("");

  async function loadBilling() {
    try {
      const res = await fetch("/api/account/billing", {
        cache: "no-store",
        credentials: "include",
      });

      if (!res.ok) return;

      const json = (await res.json()) as BillingResponse | { success?: boolean };

      if (json && "success" in json && json.success === true && "billing" in json) {
        setCurrentPlan(json.billing?.plan ?? null);
      }
    } catch {
      setCurrentPlan(null);
    }
  }

  useEffect(() => {
    void loadBilling();
  }, []);

  async function handlePaidPlan(priceId: string) {
    try {
      setLoadingPlan(priceId);
      setError("");

      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

      const json = (await res.json()) as { success?: boolean; ok?: boolean; error?: string; url?: string };

      if (!res.ok || json?.success === false || json?.ok === false) {
        throw new Error(json?.error || "Failed to create checkout session");
      }

      if (!json.url) {
        throw new Error("Missing checkout URL");
      }

      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setLoadingPlan("");
    }
  }

  const isLoanBrokerPro = currentPlan === "loan_broker_pro";

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 md:px-6">
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-gray-900 md:text-5xl">{t("pages.loanBroker.pricingTitle")}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600 md:text-lg">{t("pages.loanBroker.pricingSub")}</p>
          {currentPlan && (
            <div className="mt-4 inline-flex rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white">{t("pages.dashFragments.currentPlan")} {currentPlan.replace(/_/g, " ")}
            </div>
          )}
        </div>

        {error && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          {PLANS.map((plan) => {
            const isCurrent = plan.key === "pro" ? isLoanBrokerPro : !isLoanBrokerPro;

            return (
              <div
                key={plan.key}
                className={[
                  "rounded-3xl border bg-white p-6 shadow-sm",
                  plan.featured ? "border-gray-900 ring-1 ring-gray-900" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-900">{plan.name}</h2>
                    <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
                      {plan.price}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-gray-600">
                      {t(`pages.loanBrokerPricing.plan.${plan.key}.description`)}
                    </p>
                  </div>

                  {plan.featured && (
                    <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">{t("pages.loanBroker.popular")}</span>
                  )}
                </div>

                <ul className="mt-6 space-y-3">
                  {Array.from({ length: plan.featureCount }, (_, i) => (
                    <li
                      key={i}
                      className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700"
                    >
                      {t(`pages.loanBrokerPricing.plan.${plan.key}.f${i + 1}`)}
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {plan.key === "starter" ? (
                    <Link
                      href="/support"
                      className="block w-full rounded-2xl border px-4 py-3 text-center text-sm font-medium text-gray-900 transition hover:bg-gray-50"
                    >
                      {t(`pages.loanBrokerPricing.plan.${plan.key}.cta`)}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={isCurrent || !plan.priceId || loadingPlan === plan.priceId}
                      onClick={() => plan.priceId && void handlePaidPlan(plan.priceId)}
                      className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {isCurrent
                        ? t("pages.page.client.currentPlan")
                        : loadingPlan === plan.priceId
                          ? t("common:status.redirecting")
                          : t(`pages.loanBrokerPricing.plan.${plan.key}.cta`)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
