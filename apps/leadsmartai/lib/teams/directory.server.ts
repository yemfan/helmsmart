import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/** Who each member is, for the lists that showed "Agent 26" instead of a name. */
export type MemberDirectory = Record<string, { name: string | null; email: string | null }>;

export async function loadMemberDirectory(teamId: string): Promise<MemberDirectory> {
  try {
    const { data: rows } = await supabaseAdmin.from("team_memberships").select("agent_id").eq("team_id", teamId).limit(3000);
    const ids = ((rows as { agent_id: unknown }[] | null) ?? []).map((r) => String(r.agent_id));
    if (ids.length === 0) return {};
    const { data: agents } = await supabaseAdmin.from("agents").select("id, auth_user_id").in("id", ids as never[]);
    const agentRows = (agents as { id: unknown; auth_user_id: string | null }[] | null) ?? [];
    const userIds = agentRows.map((a) => a.auth_user_id).filter((v): v is string => Boolean(v));
    const profiles = new Map<string, { full_name: string | null; email: string | null }>();
    if (userIds.length) {
      const { data } = await supabaseAdmin.from("user_profiles").select("user_id, full_name, email").in("user_id", userIds);
      for (const p of (data as { user_id: string; full_name: string | null; email: string | null }[] | null) ?? []) profiles.set(p.user_id, { full_name: p.full_name, email: p.email });
    }
    const out: MemberDirectory = {};
    for (const a of agentRows) {
      const p = a.auth_user_id ? profiles.get(a.auth_user_id) : undefined;
      out[String(a.id)] = { name: p?.full_name?.trim() || null, email: p?.email ?? null };
    }
    return out;
  } catch (e) {
    console.warn("[teams.directory] failed:", e instanceof Error ? e.message : e);
    return {};
  }
}
