import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Who an agent is, for a greeting, a sign-off or an admin list.
 *
 * The `agents` table has NO name columns — no first_name, last_name, name,
 * email, brokerage_name or full_name. Seventeen call sites selected them
 * anyway; PostgREST answered 42703 into `.error`, the callers only read
 * `.data`, and "agent not found" is what every one of them saw. Two crons
 * never sent a thing because of it.
 *
 * Where the values live:
 *   name, email        user_profiles, joined on agents.auth_user_id
 *   brokerage          agents.brand_name, else agents.brokerage
 *   phone              agents.phone, else user_profiles.phone (display)
 *   profilePhone       user_profiles.phone alone — the agent's own mobile,
 *                      for texting the agent, not for printing on a flyer
 *
 * Batch first: one query on `agents`, one on `user_profiles`, however many
 * ids. A PostgREST error throws — the point of this module is that a bad
 * column is never silent again — so a best-effort caller wraps the call.
 */
export type AgentDisplayIdentity = {
  agentId: string;
  authUserId: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  brokerage: string | null;
  email: string | null;
  phone: string | null;
  profilePhone: string | null;
};

type AgentRow = {
  id: string | number;
  auth_user_id: string | null;
  brand_name: string | null;
  brokerage: string | null;
  phone: string | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

/** "Jane Q. Doe" → { firstName: "Jane", lastName: "Q. Doe" }; one word is all first name. */
export function splitFullName(full: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const trimmed = full?.trim() ?? "";
  if (!trimmed) return { firstName: null, lastName: null };
  const idx = trimmed.search(/\s/);
  if (idx < 0) return { firstName: trimmed, lastName: null };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1).trim() || null };
}

function fail(table: string, error: { code?: string; message: string }): never {
  throw new Error(`[agents.displayIdentity] ${table}: ${error.code ?? ""} ${error.message}`.trim());
}

export async function loadAgentDisplayIdentities(
  agentIds: Array<string | number>,
): Promise<Map<string, AgentDisplayIdentity>> {
  const out = new Map<string, AgentDisplayIdentity>();
  const ids = [...new Set(agentIds.map(String))].filter(Boolean);
  if (!ids.length) return out;

  const { data: agents, error } = await supabaseAdmin
    .from("agents")
    .select("id, auth_user_id, brand_name, brokerage, phone")
    .in("id", ids as never[]);
  if (error) fail("agents", error);
  const rows = (agents ?? []) as AgentRow[];

  const profiles = new Map<string, ProfileRow>();
  const uids = [...new Set(rows.map((r) => r.auth_user_id).filter((u): u is string => Boolean(u)))];
  if (uids.length) {
    const { data, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, full_name, email, phone")
      .in("user_id", uids as never[]);
    if (profileError) fail("user_profiles", profileError);
    for (const p of (data ?? []) as ProfileRow[]) profiles.set(p.user_id, p);
  }

  for (const r of rows) {
    const p = r.auth_user_id ? profiles.get(r.auth_user_id) : undefined;
    const fullName = p?.full_name?.trim() || null;
    out.set(String(r.id), {
      agentId: String(r.id),
      authUserId: r.auth_user_id ?? null,
      ...splitFullName(fullName),
      fullName,
      brokerage: r.brand_name?.trim() || r.brokerage?.trim() || null,
      email: p?.email?.trim() || null,
      phone: r.phone?.trim() || p?.phone?.trim() || null,
      profilePhone: p?.phone?.trim() || null,
    });
  }
  return out;
}

/** One agent. Null when the id does not exist; throws on a database error. */
export async function loadAgentDisplayIdentity(
  agentId: string | number,
): Promise<AgentDisplayIdentity | null> {
  const map = await loadAgentDisplayIdentities([agentId]);
  return map.get(String(agentId)) ?? null;
}
