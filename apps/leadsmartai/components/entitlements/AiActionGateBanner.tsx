"use client";

import { emitLeadsmartUpgradePrompt } from "@/lib/funnel/emitUpgradePrompt";
import type { AiActionGateReason } from "@/lib/entitlements/aiActionGate";
import { useTranslation } from "react-i18next";

/**
 * Inline banner shown when an AI endpoint returns HTTP 402 — every AI
 * surface (SMS draft, script generator, deal review, growth
 * opportunities, deal assistant) renders this instead of an ad-hoc red
 * error so the failure mode + next step look the same everywhere.
 *
 * Two reasons → two copy variants:
 *   - `no_agent_entitlement`  → "AI isn't on your plan yet"
 *   - `ai_usage_limit_reached` → "You've hit this period's cap"
 *
 * Primary CTA fires the workspace upgrade modal via the global event
 * (so layout-mounted `EntitlementUpgradeModal` opens). Secondary link
 * goes straight to /dashboard/billing for the plan comparison.
 */
export function AiActionGateBanner({
  reason,
  className,
}: {
  reason: AiActionGateReason;
  className?: string;
}) {
  const { t } = useTranslation("dashboard");
  const isLimit = reason === "ai_usage_limit_reached";
  const title = isLimit
    ? "You've hit your AI limit for this period"
    : "AI actions aren't on your plan yet";
  const body = isLimit
    ? "Your current plan caps how many AI drafts run each month. Upgrade for a higher limit, or wait until next period."
    : "AI-drafted SMS, scripts, deal reviews, and growth opportunities run on a paid plan. Pick a plan to turn this on for your workspace.";
  return (
    <div
      className={[
        "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900",
        className ?? "",
      ].join(" ")}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 leading-snug text-amber-800">{body}</p>
      {/* Primary opens the upgrade modal (workspace-level UX), secondary
          deep-links to the full plan-comparison page at /agent/pricing
          (Starter / Pro / Premium / Team feature breakdown). Different
          surfaces, different destinations — used to both go to
          /dashboard/billing which made the second button feel redundant. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => emitLeadsmartUpgradePrompt(reason)}
          className="rounded-md bg-amber-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-800"
        >
          {isLimit ? "View plans & upgrade" : "Choose a plan"}
        </button>
        <a
          href="/agent/pricing"
          className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
        >{t("pages.misc.comparePlans")}</a>
      </div>
    </div>
  );
}
