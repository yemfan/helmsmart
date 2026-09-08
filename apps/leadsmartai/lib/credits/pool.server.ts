import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Whose credits pay for a user's action.
 *
 * Normally their own. When they belong to a team whose owner turned on
 * pooled credits, the owner's. One answer for every spend, refund and
 * balance read, so the ledger, the header pill and the Credits page never
 * disagree. Looked up on every call (two small reads) rather than cached:
 * a spend is already a paid action, and an owner who turns pooling off must
 * see it take effect at once.
 *
 * Never throws: on any failure the user pays for themselves, which is the
 * pre-pooling behaviour and the safe direction.
 */
export type CreditAccount = {
  /** The user whose leadsmart_users.credits this action moves. */
  payerUserId: string;
  /** True when that is someone else's balance (the team owner's). */
  pooled: boolean;
  teamName: string | null;
};

export async function resolveCreditAccount(userId: string): Promise<CreditAccount> {
  const own: CreditAccount = { payerUserId: userId, pooled: false, teamName: null };
  if (!userId) return own;
  try {
    const { data: agent } = await supabaseAdmin.from("agents").select("id").eq("auth_user_id", userId).maybeSingle();
    const agentId = (agent as { id?: unknown } | null)?.id;
    if (agentId == null) return own;

    const { data: rows } = await supabaseAdmin
      .from("team_memberships")
      .select("role, created_at, teams!inner(name, owner_agent_id, pooled_credits)")
      .eq("agent_id", agentId as never)
      .order("created_at", { ascending: true })
      .limit(5);
    type Row = { role: string; teams: { name: string; owner_agent_id: unknown; pooled_credits: boolean } | { name: string; owner_agent_id: unknown; pooled_credits: boolean }[] };
    const pooledTeam = ((rows as Row[] | null) ?? [])
      .map((r) => (Array.isArray(r.teams) ? r.teams[0] : r.teams))
      .find((t) => t && t.pooled_credits);
    if (!pooledTeam || String(pooledTeam.owner_agent_id) === String(agentId)) return own;

    const { data: owner } = await supabaseAdmin.from("agents").select("auth_user_id").eq("id", pooledTeam.owner_agent_id as never).maybeSingle();
    const ownerUserId = (owner as { auth_user_id?: string | null } | null)?.auth_user_id;
    if (!ownerUserId) return own;
    return { payerUserId: ownerUserId, pooled: true, teamName: pooledTeam.name ?? null };
  } catch (e) {
    console.warn("[credits.pool] resolve failed:", e instanceof Error ? e.message : e);
    return own;
  }
}
