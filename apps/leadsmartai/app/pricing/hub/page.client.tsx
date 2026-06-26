"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PricingHubContext } from "@/lib/pricing/pricingHubContext";
import {
  LOGGED_IN_ACTIVATE_AGENT_ACCESS_LABEL,
  LOGGED_IN_GET_AGENT_ACCESS_LABEL,
  LOGGED_IN_VIEW_AGENT_PLANS_LABEL,
  LOGGED_IN_VIEW_AGENT_PRICING_LABEL,
} from "@/lib/auth/startFreeAgentMarketing";

type ProductCard = {
  key: "consumer" | "agent" | "loan_broker";
  title: string;
  audience: string;
  price: string;
  description: string;
  features: string[];
  href: string;
};

const baseProducts: ProductCard[] = [
  {
    key: "consumer",
    title: "PropertyToolsAI",
    audience: "Buyers, sellers, and investors",
    price: "From $0",
    description:
      "Smart real estate tools for home value, financing, comparisons, and decision support.",
    features: [
      "Property insights",
      "Mortgage tools",
      "AI comparisons",
      "Premium consumer features",
    ],
    href: "/pricing/consumer",
  },
  {
    key: "agent",
    title: "RealtyBoss for Agents",
    audience: "Real estate agents",
    price: "Free to start",
    description:
      "Lead capture, CRM, CMA workflow, follow-up tools, and AI-powered deal conversion.",
    features: ["Starter / Growth / Elite", "CMA workflow", "Lead pipeline", "CRM + AI follow-up"],
    href: "/pricing/agent",
  },
  {
    key: "loan_broker",
    title: "RealtyBoss for Loan Brokers",
    audience: "Loan brokers and mortgage professionals",
    price: "From $99/mo",
    description:
      "Borrower pipeline, financing workflow, loan scenarios, and stronger conversion tools.",
    features: [
      "Borrower pipeline",
      "Loan scenarios",
      "Broker workflow tools",
      "Advanced finance workspace",
    ],
    href: "/pricing/loan-broker",
  },
];

type CardState = {
  featured: boolean;
  badge: string | null;
  cta: string;
  href: string;
};

function getCardState(key: ProductCard["key"], context: PricingHubContext | null): CardState {
  if (!context?.loggedIn) {
    return {
      featured: key === "agent",
      badge: key === "agent" ? "Most Popular" : null,
      cta: "View Pricing",
      href:
        key === "consumer"
          ? "/pricing/consumer"
          : key === "agent"
            ? "/pricing/agent"
            : "/pricing/loan-broker",
    };
  }

  if (key === "consumer") {
    if (context.entitlements.consumerPremium || context.billingPlan === "consumer_premium") {
      return {
        featured: false,
        badge: "Current Plan",
        cta: "Manage Billing",
        href: "/account/billing",
      };
    }

    return {
      featured: context.role === "consumer",
      badge: context.role === "consumer" ? "Recommended" : null,
      cta: "View Consumer Pricing",
      href: "/pricing/consumer",
    };
  }

  if (key === "agent") {
    if (context.entitlements.leadsmartAgent) {
      return {
        featured: true,
        badge: "Agent Access Active",
        cta: "Manage Agent Billing",
        href: "/account/billing",
      };
    }

    const role = context.role;
    // Signed-in: never use the anonymous “Start Free as Agent” marketing line.
    if (role === "consumer") {
      return {
        featured: true,
        badge: "Recommended",
        cta: LOGGED_IN_GET_AGENT_ACCESS_LABEL,
        href: "/agent/pricing",
      };
    }
    if (role === "agent") {
      return {
        featured: true,
        badge: "Setup",
        cta: LOGGED_IN_ACTIVATE_AGENT_ACCESS_LABEL,
        href: "/start-free/agent",
      };
    }
    if (role === "loan_broker") {
      return {
        featured: true,
        badge: null,
        cta: LOGGED_IN_VIEW_AGENT_PRICING_LABEL,
        href: "/agent/pricing",
      };
    }
    if (role === "admin" || role === "support") {
      return {
        featured: false,
        badge: null,
        cta: LOGGED_IN_VIEW_AGENT_PRICING_LABEL,
        href: "/agent/pricing",
      };
    }

    return {
      featured: false,
      badge: null,
      cta: LOGGED_IN_VIEW_AGENT_PLANS_LABEL,
      href: "/agent/pricing",
    };
  }

  if (key === "loan_broker") {
    if (
      context.entitlements.leadsmartLoanBroker ||
      context.billingPlan === "loan_broker_pro"
    ) {
      return {
        featured: true,
        badge: "Loan Broker Access Active",
        cta: "Manage Billing",
        href: "/account/billing",
      };
    }

    return {
      featured: context.role === "loan_broker",
      badge: context.role === "loan_broker" ? "Recommended" : null,
      cta: "View Loan Broker Pricing",
      href: "/pricing/loan-broker",
    };
  }

  return {
    featured: false,
    badge: null,
    cta: "View Pricing",
    href: "/pricing/hub",
  };
}

export default function PricingHubClientPage() {
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
            Choose the Right Plan
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-gray-600 md:text-lg">
            Find the best fit for your workflow, whether you&apos;re exploring properties,
            converting leads as an agent, or managing borrower pipelines.
          </p>

          {context?.loggedIn && (
            <div className="mt-4 inline-flex rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white">
              Signed in as {roleDisplay ?? "member"}
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
                  <div className="text-sm font-medium text-gray-500">{product.audience}</div>
                  <h2 className="mt-2 text-2xl font-semibold text-gray-900">{product.title}</h2>
                  <div className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
                    {product.price}
                  </div>
                </div>

                {product.state.badge && (
                  <span
                    className={[
                      "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                      product.state.badge.includes("Active") || product.state.badge === "Current Plan"
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-gray-900 text-white",
                    ].join(" ")}
                  >
                    {product.state.badge}
                  </span>
                )}
              </div>

              <p className="mt-4 text-sm leading-6 text-gray-600">{product.description}</p>

              <ul className="mt-6 space-y-3">
                {product.features.map((feature) => (
                  <li
                    key={feature}
                    className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700"
                  >
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <Link
                  href={product.state.href}
                  className="block w-full rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-gray-800"
                >
                  {product.state.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-gray-900">Need help choosing?</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">Researching homes</div>
              <p className="mt-2 text-sm text-gray-600">
                Start with PropertyToolsAI if you want smarter property and financing tools.
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">Growing as an agent</div>
              <p className="mt-2 text-sm text-gray-600">
                Start with RealtyBoss for Agents if you need lead workflow, CRM, and AI follow-up.
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 p-5">
              <div className="text-sm font-semibold text-gray-900">Managing borrowers</div>
              <p className="mt-2 text-sm text-gray-600">
                Start with RealtyBoss for Loan Brokers if you need borrower workflow and finance
                tools.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
