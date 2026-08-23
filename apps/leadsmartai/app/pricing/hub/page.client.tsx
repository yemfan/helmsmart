"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PricingHubContext } from "@/lib/pricing/pricingHubContext";

/*
 * Cards carry a key and a route, never copy — a module constant is evaluated
 * once, before any locale is known, so a title stored here renders English to
 * every reader. Titles, prices and feature bullets come from
 * `web_pricing.hub.products.*` at render time.
 */
type ProductCard = {
  key: "consumer" | "agent";
  href: string;
};

const baseProducts: ProductCard[] = [
  { key: "consumer", href: "/pricing/consumer" },
  { key: "agent", href: "/pricing/agent" },
];

const FEATURE_KEYS = ["f1", "f2", "f3", "f4"] as const;

type CardState = {
  featured: boolean;
  /** Key under `hub.badge`, or null for no badge. */
  badge: string | null;
  /**
   * Whether the badge means "you already have this". It used to be read back
   * out of the badge TEXT (`badge.includes("Active")`), which stops being true
   * the moment the text is translated — 已开通 contains no "Active".
   */
  badgeActive: boolean;
  /** Key under `hub.cta`. */
  cta: string;
  href: string;
};

function getCardState(key: ProductCard["key"], context: PricingHubContext | null): CardState {
  if (!context?.loggedIn) {
    return {
      featured: key === "agent",
      badge: key === "agent" ? "mostPopular" : null,
      badgeActive: false,
      cta: "viewPricing",
      href: key === "consumer" ? "/pricing/consumer" : "/pricing/agent",
    };
  }

  if (key === "consumer") {
    if (context.entitlements.consumerPremium || context.billingPlan === "consumer_premium") {
      return {
        featured: false,
        badge: "currentPlan",
        badgeActive: true,
        cta: "manageBilling",
        href: "/account/billing",
      };
    }

    return {
      featured: context.role === "consumer",
      badge: context.role === "consumer" ? "recommended" : null,
      badgeActive: false,
      cta: "viewConsumerPricing",
      href: "/pricing/consumer",
    };
  }

  if (key === "agent") {
    if (context.entitlements.leadsmartAgent) {
      return {
        featured: true,
        badge: "agentActive",
        badgeActive: true,
        cta: "manageAgentBilling",
        href: "/account/billing",
      };
    }

    const role = context.role;
    // Signed-in: never use the anonymous “Start Free as Agent” marketing line.
    if (role === "consumer") {
      return {
        featured: true,
        badge: "recommended",
        badgeActive: false,
        cta: "getAgentAccess",
        href: "/agent/pricing",
      };
    }
    if (role === "agent") {
      return {
        featured: true,
        badge: "setup",
        badgeActive: false,
        cta: "activateAgentAccess",
        href: "/start-free/agent",
      };
    }
    if (role === "admin" || role === "support") {
      return {
        featured: false,
        badge: null,
        badgeActive: false,
        cta: "viewAgentPricing",
        href: "/agent/pricing",
      };
    }

    return {
      featured: false,
      badge: null,
      badgeActive: false,
      cta: "viewAgentPlans",
      href: "/agent/pricing",
    };
  }

  return {
    featured: false,
    badge: null,
    badgeActive: false,
    cta: "viewPricing",
    href: "/pricing/hub",
  };
}

export default function PricingHubClientPage() {
  const { t } = useTranslation("web_pricing");
  const [context, setContext] = useState<PricingHubContext | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/pricing/hub-context", {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await res.json()) as { success?: boolean; context?: PricingHubContext };
        if (res.ok && json?.success && json.context) {
          setContext(json.context);
        }
      } catch {
        setContext(null);
      }
    }

    void load();
  }, []);

  const products = useMemo(() => {
    return baseProducts.map((product) => ({
      ...product,
      state: getCardState(product.key, context),
    }));
  }, [context]);

  const roleDisplay = context?.role?.replace(/_/g, " ");

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 md:px-6">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-gray-900 md:text-5xl">
            {t("hub.heading")}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-gray-600 md:text-lg">
            {t("hub.sub")}
          </p>

          {context?.loggedIn && (
            <div className="mt-4 inline-flex rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white">
              {t("hub.signedInAs", { role: roleDisplay ?? t("hub.memberFallback") })}
            </div>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.key}
              className={[
                "rounded-3xl border bg-white p-6 shadow-sm",
                product.state.featured ? "border-gray-900 ring-1 ring-gray-900" : "",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-500">
                    {t(`hub.products.${product.key}.audience`)}
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-gray-900">
                    {t(`hub.products.${product.key}.title`)}
                  </h2>
                  <div className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
                    {t(`hub.products.${product.key}.price`)}
                  </div>
                </div>

                {product.state.badge && (
                  <span
                    className={[
                      "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                      product.state.badgeActive
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-gray-900 text-white",
                    ].join(" ")}
                  >
                    {t(`hub.badge.${product.state.badge}`)}
                  </span>
                )}
              </div>

              <p className="mt-4 text-sm leading-6 text-gray-600">
                {t(`hub.products.${product.key}.description`)}
              </p>

              <ul className="mt-6 space-y-3">
                {FEATURE_KEYS.map((f) => (
                  <li
                    key={f}
                    className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700"
                  >
                    {t(`hub.products.${product.key}.${f}`)}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <Link
                  href={product.state.href}
                  className="block w-full rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-gray-800"
                >
                  {t(`hub.cta.${product.state.cta}`)}
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-gray-900">{t("hub.help.heading")}</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">
                {t("hub.help.researchingTitle")}
              </div>
              <p className="mt-2 text-sm text-gray-600">{t("hub.help.researchingBody")}</p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">{t("hub.help.agentTitle")}</div>
              <p className="mt-2 text-sm text-gray-600">{t("hub.help.agentBody")}</p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">{t("hub.help.brokerTitle")}</div>
              <p className="mt-2 text-sm text-gray-600">{t("hub.help.brokerBody")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
