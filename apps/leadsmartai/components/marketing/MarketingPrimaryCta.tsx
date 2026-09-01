"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/AuthProvider";

const CLASS =
  "hidden items-center justify-center rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:inline-flex sm:text-sm";

/**
 * The header's primary call to action, which now depends on who is reading it.
 *
 * It used to say "Hire Your AI Team Free" to everybody, including customers
 * signed in on the same page with their avatar in the next element along. Being
 * asked to sign up for something you already pay for reads as software that has
 * not noticed you, and it wastes the most valuable button on the page.
 *
 * Three states:
 *   signed out          → sign up, unchanged
 *   signed in, no plan  → upgrade, which is the next step that actually exists
 *   signed in, paying   → open the app; asking a Signature customer to upgrade
 *                         is the same mistake in a different hat
 *
 * The plan comes from /api/me, which reads the entitlement system rather than
 * the legacy plan column. Fetched only when signed in, so the logged-out
 * visitor — most of this page's traffic — pays nothing for it.
 */
export default function MarketingPrimaryCta() {
  const { t } = useTranslation("web_marketing");
  const { user, loading } = useAuth();
  const [plan, setPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setPlan(null);
      return;
    }
    let cancelled = false;
    setPlanLoading(true);
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPlan(String(d?.plan ?? "free"));
      })
      .catch(() => {
        // Fall back to the upgrade wording. It is the safe wrong answer: an
        // upgrade link still works for a paying customer, whereas "sign up
        // free" tells them we do not know who they are.
        if (!cancelled) setPlan("free");
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Hold the space rather than flashing the wrong label — this button changes
  // meaning, so guessing during the gap is worse than a moment of blank.
  if (loading || (user && planLoading)) {
    return <div className="hidden h-9 w-40 animate-pulse rounded-lg bg-gray-100 sm:block" aria-hidden />;
  }

  if (!user) {
    return (
      <Link href="/onboarding" className={CLASS}>
        {t("cta.hire_ai_team", { defaultValue: "Hire Your AI Team Free" })}
      </Link>
    );
  }

  const paying = !!plan && !["free", "guest", "none", ""].includes(plan.toLowerCase());
  return paying ? (
    <Link href="/dashboard" className={CLASS}>
      {t("cta.open_app", { defaultValue: "Open CloseBoss" })}
    </Link>
  ) : (
    <Link href="/agent/pricing" className={CLASS}>
      {t("cta.upgrade", { defaultValue: "Upgrade" })}
    </Link>
  );
}
