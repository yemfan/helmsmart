import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { planRunsTeams, showTeamNav } from "./visibility";

/**
 * Whether this person's sidebar shows the Team row. A plan that runs teams
 * answers without a query; otherwise one head-count on team_memberships.
 * Never throws: on a read failure the row is hidden for that render, which
 * costs a member one click to the address bar, not a broken page.
 */
export async function teamNavVisibleFor(args: { userId: string; agentId?: string | null; plan?: string | null }): Promise<boolean> {
  try {
    let plan = args.plan ?? null;
    if (plan === null) {
      const { data } = await supabaseAdmin
        .from("product_entitlements")
        .select("plan")
        .eq("user_id", args.userId)
        .eq("product", "leadsmart_agent")
        .eq("is_active", true)
        .maybeSingle();
      plan = (data as { plan?: string | null } | null)?.plan ?? null;
    }
    if (planRunsTeams(plan)) return true;

    let agentId = args.agentId ?? null;
    if (!agentId) {
      const { data } = await supabaseAdmin.from("agents").select("id").eq("auth_user_id", args.userId).maybeSingle();
      agentId = (data as { id?: unknown } | null)?.id != null ? String((data as { id: unknown }).id) : null;
    }
    if (!agentId) return false;
    const { count } = await supabaseAdmin.from("team_memberships").select("team_id", { count: "exact", head: true }).eq("agent_id", agentId as never);
    return showTeamNav({ plan, isMember: (count ?? 0) > 0 });
  } catch (e) {
    console.warn("[teams.visibility] failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
