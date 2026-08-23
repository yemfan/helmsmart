import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserWithRole } from "@/lib/auth/getCurrentUser";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { getActiveAgentEntitlement } from "@/lib/entitlements/getEntitlements";
import StartFreeAgentClientPage from "./page.client";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.startFreeAgent.title", { ns: "web_marketing" });
  const description = t("routeMeta.startFreeAgent.description", { ns: "web_marketing" });
  return {
  title,
  description,
};
}

export default async function StartFreeAgentPage() {
  const user = await getCurrentUserWithRole();

  if (!user) {
    redirect("/login?next=/start-free/agent");
  }

  const supabase = supabaseServerClient();
  const entitlement = await getActiveAgentEntitlement(supabase, user.id).catch(() => null);
  const activePlan = entitlement ? String((entitlement as { plan?: string }).plan ?? "") : null;

  // Already has a plan — send to dashboard, not here.
  if (activePlan) {
    redirect("/agent/dashboard");
  }

  return <StartFreeAgentClientPage />;
}
