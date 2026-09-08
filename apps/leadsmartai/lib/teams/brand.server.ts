import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeBrand, type TeamBrand } from "./brand";

/**
 * The brokerage brand for an agent's public hub: the brand of the first
 * team they belong to, oldest membership first. Null when they are on no
 * team or the team set nothing. Never throws: a hub renders without a
 * brokerage line before it fails to render.
 */
export async function loadBrandForAgent(agentId: string | number): Promise<TeamBrand | null> {
  try {
    const { data } = await supabaseAdmin
      .from("team_memberships")
      .select("created_at, teams!inner(brand)")
      .eq("agent_id", agentId as never)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const teams = (data as { teams?: { brand?: unknown } | { brand?: unknown }[] } | null)?.teams;
    const brand = Array.isArray(teams) ? teams[0]?.brand : teams?.brand;
    return normalizeBrand(brand);
  } catch (e) {
    console.warn("[teams.brand] load failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function loadTeamBrand(teamId: string): Promise<TeamBrand | null> {
  const { data } = await supabaseAdmin.from("teams").select("brand").eq("id", teamId).maybeSingle();
  return normalizeBrand((data as { brand?: unknown } | null)?.brand);
}

export async function saveTeamBrand(teamId: string, brand: TeamBrand | null): Promise<void> {
  const { error } = await supabaseAdmin.from("teams").update({ brand, updated_at: new Date().toISOString() } as never).eq("id", teamId);
  if (error) throw new Error(error.message);
}
