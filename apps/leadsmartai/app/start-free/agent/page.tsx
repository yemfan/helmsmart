import { redirect } from "next/navigation";
import { getCurrentUserWithRole } from "@/lib/auth/getCurrentUser";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { getActiveAgentEntitlement } from "@/lib/entitlements/getEntitlements";
import StartFreeAgentClientPage from "./page.client";

export const metadata = {
  title: "Choose Your Plan",
  description: "Pick a plan to unlock your CloseBoss Agent workspace.",
};

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
