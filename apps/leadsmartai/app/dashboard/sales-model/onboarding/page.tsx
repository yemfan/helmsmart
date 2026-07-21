import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getSelectedSalesModelServer } from "@/lib/sales-model-server";
import { OnboardingClient } from "./OnboardingClient";

export const metadata: Metadata = {
  title: "Choose Your Sales Model",
  description:
    "Pick a sales model to personalize your CloseBoss dashboard, scripts, tasks, and pipeline.",
  robots: { index: false },
};

/**
 * Sales-model onboarding entry. Server component:
 *   - Resolves the agent's current selection from Supabase.
 *   - If a model is already set, fast-paths to /dashboard/sales-model
 *     so existing users don't get bounced through onboarding twice.
 *   - Otherwise hands the empty state to the client child.
 */
export default async function SalesModelOnboardingPage() {
  const { userId } = await getCurrentAgentContext();
  const existing = await getSelectedSalesModelServer(userId);
  if (existing) {
    redirect("/dashboard/sales-model");
  }
  return <OnboardingClient />;
}
