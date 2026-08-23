"use client";

import Link from "next/link";
import type { LimitReason } from "@/lib/entitlements/types";
import { useTranslation } from "react-i18next";

type Props = {
  open: boolean;
  onClose: () => void;
  reason: LimitReason | null;
  plan: string | null;
};

function getMessage(reason: LimitReason | null) {
  switch (reason) {
    case "lead_limit_reached":
      return {
        title: "You’ve reached your lead limit",
        body: "Upgrade to Pro to manage up to 500 leads and keep your pipeline moving.",
      };
    case "cma_limit_reached":
      return {
        title: "You’ve used all CMA reports for today",
        body: "Upgrade to unlock more daily CMA reports and support more client activity.",
      };
    case "contact_limit_reached":
      return {
        title: "Your CRM contact limit has been reached",
        body: "Upgrade to Pro or Premium to continue adding contacts and scaling your business.",
      };
    case "download_limit_reached":
      return {
        title: "This download is not included in your plan",
        body: "Upgrade to unlock full report downloads and advanced exports.",
      };
    case "team_access_not_enabled":
      return {
        title: "Team access is not enabled on your plan",
        body: "Upgrade to Premium to invite teammates and collaborate inside your workspace.",
      };
    case "ai_usage_limit_reached":
      return {
        title: "Monthly AI limit reached",
        body: "You’ve used your included AI drafts for this plan. Upgrade to Pro for full AI, automation, and higher limits.",
      };
    case "crm_prediction_locked":
      return {
        title: "Deal prediction is a Pro feature",
        body: "See high-probability leads and run predictions on your pipeline with a Pro or Team CRM plan.",
      };
    case "crm_automation_locked":
      return {
        title: "Automation is a Pro feature",
        body: "Smart follow-ups and automation rules unlock on Pro and Team. Upgrade to turn them on.",
      };
    case "crm_full_ai_locked":
      return {
        title: "Advanced AI requires Pro",
        body: "Offer assistant and deeper AI workflows need a Pro or Team subscription.",
      };
    case "no_agent_entitlement":
    default:
      return {
        title: "Upgrade Your Plan",
        body:
          "Choose a plan to unlock your full workspace, lead tools, CRM, and AI actions.",
      };
  }
}

function isCrmReason(reason: LimitReason | null): boolean {
  if (!reason) return false;
  return (
    reason === "ai_usage_limit_reached" ||
    reason === "crm_prediction_locked" ||
    reason === "crm_automation_locked" ||
    reason === "crm_full_ai_locked"
  );
}

export default function EntitlementUpgradeModal({ open, onClose, reason, plan }: Props) {
  const { t } = useTranslation("dashboard");
  if (!open) return null;

  const message = getMessage(reason);
  const crm = isCrmReason(reason);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">{message.title}</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">{message.body}</p>
            {plan ? (
              <div className="mt-3 text-xs text-gray-400">{t("pages.entitlementUpgrade.currentPlan")}<span className="font-medium text-gray-700">{plan}</span>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            aria-label={t("pages.entitlementUpgrade.close")}
          >
            ✕
          </button>
        </div>

        {/* Two distinct destinations so the buttons aren't redundant:
              Primary   → /dashboard/billing (in-app subscription
                          management — current plan, Manage billing,
                          Stripe portal, switch plans)
              Secondary → /agent/pricing (the marketing-style plan
                          comparison page with the full
                          Starter / Pro / Premium / Team breakdown,
                          feature lists, and coaching-tier copy) */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard/billing"
            className="rounded-2xl bg-gray-900 px-5 py-3 text-center text-sm font-medium text-white transition hover:bg-gray-800"
            onClick={onClose}
          >
            {crm ? t("pages.aiActionGateBanner.viewPlansUpgrade") : t("pages.entitlementUpgrade.upgradeNow")}
          </Link>
          <Link
            href="/agent/pricing"
            className="rounded-2xl border px-5 py-3 text-center text-sm font-medium text-gray-900 transition hover:bg-gray-50"
            onClick={onClose}
          >{t("pages.entitlementUpgrade.comparePlans")}</Link>
        </div>
      </div>
    </div>
  );
}

/** Short labels for UI — map to `LimitReason` when opening the modal */
export type UpgradeLimitKind = "lead" | "cma" | "contact" | "report" | "team";

export function upgradeKindToLimitReason(kind: UpgradeLimitKind): LimitReason {
  switch (kind) {
    case "lead":
      return "lead_limit_reached";
    case "cma":
      return "cma_limit_reached";
    case "contact":
      return "contact_limit_reached";
    case "report":
      return "download_limit_reached";
    case "team":
      return "team_access_not_enabled";
    default:
      return "no_agent_entitlement";
  }
}
