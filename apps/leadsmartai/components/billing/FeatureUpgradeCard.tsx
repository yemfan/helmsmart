import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";
import { getServerT } from "@/lib/i18n/server";

/**
 * Server-rendered "this feature needs a higher plan" gate. Used by pages
 * (Books, Expenses, …) when `userHasCrmFeature(...)` is false, so a lower-tier
 * user lands on an upgrade prompt instead of the gated UI. Enforcement lives in
 * the page/route; this is just the presentation.
 */
export default async function FeatureUpgradeCard({
  title,
  description,
  requiredPlan,
}: {
  title: string;
  description: string;
  requiredPlan: string;
}) {
  const t = await getServerT("dashboard");
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
        <Lock className="h-6 w-6 text-blue-600" strokeWidth={2} />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <p className="mt-1 text-sm text-slate-500">{t("pages.featureUpgrade.availableOn")}<span className="font-medium text-slate-700">{requiredPlan}</span>{t("pages.featureUpgrade.andUp")}</p>
      <Link
        href="/dashboard/billing"
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >{t("pages.featureUpgrade.upgradePlan")}<ArrowRight className="h-4 w-4" strokeWidth={2} />
      </Link>
    </div>
  );
}
