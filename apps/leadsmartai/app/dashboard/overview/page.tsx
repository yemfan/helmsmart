import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";
import { UpgradeBanner } from "@/components/upsell/UpgradeBanner";
import { BossOnboardingCard } from "@/components/dashboard/BossOnboardingCard";
import { computeActivationChecklist } from "@/lib/activation/checklist";
import OverviewClient from "./OverviewClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.overview", { ns: "dashboard" });
  return {
  title,
  description: "View your daily pipeline snapshot, lead activity, and key metrics.",
  keywords: ["dashboard", "overview", "real estate CRM"],
  robots: { index: false },
};
}

export default async function OverviewPage() {
  const t = await getServerT();
  const ctx = await getCurrentAgentContext();

  const { data: profileRow } = await supabaseServer
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  const greetingName =
    String((profileRow as { full_name?: string | null } | null)?.full_name ?? "")
      .trim()
      .split(/\s+/)[0] ?? "";

  // Boss-guided activation: real setup progress from actual data drives a
  // proactive Boss onboarding conversation. It hides itself once complete (or
  // if dismissed), so it only guides until the agent's AI team is working.
  const activation = await computeActivationChecklist(ctx.agentId, ctx.userId);

  return (
    <div className="space-y-4">
      <UpgradeBanner planType={ctx.planType} variant="banner" />
      <BossOnboardingCard checklist={activation} />
      <OverviewClient greetingName={greetingName} planType={ctx.planType} />
    </div>
  );
}
