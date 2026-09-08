import "server-only";

import { isValidUsername, suggestUsername, USERNAME_MAX } from "@/lib/identity/username";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Give a newly joined agent a hub address the moment they accept, so the
 * board's "hub live" is one click away instead of a form away. Suggests a
 * handle from their name, takes the first free one (name, name2, name3 …),
 * and writes it only when they have none. Never throws and never overwrites:
 * an address an agent chose is theirs.
 */
export async function provisionHubUsername(agentId: string | number): Promise<string | null> {
  try {
    const { data: agent } = await supabaseAdmin.from("agents").select("username, auth_user_id, brand_name").eq("id", agentId as never).maybeSingle();
    const a = agent as { username?: string | null; auth_user_id?: string | null; brand_name?: string | null } | null;
    if (!a) return null;
    if (a.username) return a.username;

    let first: string | null = null;
    let last: string | null = null;
    if (a.auth_user_id) {
      const { data: prof } = await supabaseAdmin.from("user_profiles").select("full_name").eq("user_id", a.auth_user_id).maybeSingle();
      const full = ((prof as { full_name?: string | null } | null)?.full_name ?? "").trim();
      if (full) {
        const parts = full.split(/\s+/);
        first = parts[0] ?? null;
        last = parts.slice(1).join(" ") || null;
      }
    }
    const base = suggestUsername({ firstName: first, lastName: last, brandName: a.brand_name ?? null });
    if (!base) return null;

    for (let n = 1; n <= 30; n += 1) {
      const suffix = n === 1 ? "" : String(n);
      const candidate = `${base.slice(0, USERNAME_MAX - suffix.length)}${suffix}`;
      if (!isValidUsername(candidate)) continue;
      const { data: taken } = await supabaseAdmin.from("agents").select("id").eq("username", candidate).limit(1).maybeSingle();
      if (taken) continue;
      const { error } = await supabaseAdmin
        .from("agents")
        .update({ username: candidate } as never)
        .eq("id", agentId as never)
        .is("username", null);
      if (error) {
        // A race on the same handle: try the next one.
        continue;
      }
      return candidate;
    }
    return null;
  } catch (e) {
    console.warn("[teams.provisionHub] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
