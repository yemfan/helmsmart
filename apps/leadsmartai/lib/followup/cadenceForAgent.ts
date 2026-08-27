import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { salesModels, isSalesModelId, type SalesCadence } from "@/lib/sales-models";

/**
 * The follow-up rhythm this agent has chosen, by way of their sales model.
 *
 * Two hops, because the model is stored against the USER and the drip works in
 * agent ids: agents.auth_user_id → agent_profiles.sales_model.
 *
 * Falls back to Advisor, which is both the recommended default and the most
 * conservative ladder we ship. If we cannot tell what someone picked, the wrong
 * direction to guess is "chase them harder".
 */
export async function cadenceForAgent(agentId: string): Promise<SalesCadence> {
  const fallback = salesModels.advisor.cadence;
  try {
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("auth_user_id")
      .eq("id", agentId as never)
      .maybeSingle();
    const userId = (agent as { auth_user_id?: string | null } | null)?.auth_user_id;
    if (!userId) return fallback;

    const { data: profile } = await supabaseAdmin
      .from("agent_profiles")
      .select("sales_model")
      .eq("user_id", userId)
      .maybeSingle();
    const id = (profile as { sales_model?: string } | null)?.sales_model;
    return id && isSalesModelId(id) ? salesModels[id].cadence : fallback;
  } catch {
    return fallback;
  }
}
