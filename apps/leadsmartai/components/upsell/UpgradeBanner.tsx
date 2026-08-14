"use client";

import { useTranslation } from "react-i18next";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Props = {
  planType: string;
  /** Short message, e.g. "You're on the free plan" */
  message?: string;
  /** What upgrade unlocks, e.g. "500 leads, full AI, automation" */
  unlocks?: string;
  /** Override CTA label */
  cta?: string;
  /** Override link target */
  href?: string;
  /** "banner" = full-width colored strip, "card" = rounded card, "inline" = subtle inline */
  variant?: "banner" | "card" | "inline";
};

export function UpgradeBanner({
  planType,
  message,
  unlocks,
  cta,
  href = "/dashboard/billing",
  variant = "banner",
}: Props) {
  const { t } = useTranslation("dashboard");
  const isFree = !planType || planType === "free" || planType === "starter";
  if (!isFree) return null;

  const defaultMessage = t("upgrade.starterPlan");
  const defaultUnlocks = t("upgrade.unlocks");
  const defaultCta = t("upgrade.cta");

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-2.5">
        <p className="flex-1 text-sm text-amber-800">
          {message ?? defaultMessage} &mdash; {unlocks ?? defaultUnlocks}
        </p>
        <Link
          href={href}
          className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          {cta ?? defaultCta}
        </Link>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">{message ?? defaultMessage}</p>
            <p className="mt-1 text-xs text-slate-300">{unlocks ?? defaultUnlocks}</p>
          </div>
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          >
            {cta ?? defaultCta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  // Default: banner
  return (
    <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-white">
          {message ?? defaultMessage} &mdash; {unlocks ?? defaultUnlocks}
        </p>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm hover:bg-white"
        >
          {cta ?? defaultCta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
