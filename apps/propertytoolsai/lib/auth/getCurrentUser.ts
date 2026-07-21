import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { fullNameFromUserMetadata } from "@/lib/auth/canonicalUserContact";
import { ensureFreePropertytoolsAccount } from "@/lib/auth/ensureAppAccess";
import { mapLegacyUserProfileRoleToRbac } from "./mapLegacyRole";
import type { ProfileRow } from "./profileTypes";
import type { UserRole } from "./roles";

export type SessionUserWithProfile = {
  user: User;
  profile: ProfileRow;
};

/**
 * Authenticated Supabase user from the App Router cookie session.
 * Throws on auth transport errors; returns `null` when there is no session.
 */
export async function getCurrentUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return user;
}

function rbacFromLeadsmartRole(role: string | null | undefined): UserRole {
  const r = String(role ?? "")
    .toLowerCase()
    .trim();
  if (r === "user" || r === "") return "consumer";
  return mapLegacyUserProfileRoleToRbac(role);
}

function normalizeProfileRow(
  row: Record<string, unknown>,
  user: User,
  tier: string | null | undefined
): ProfileRow {
  const id = String(row.user_id ?? row.id ?? user.id);
  const lsRaw = row.leadsmart_users;
  const ls = lsRaw == null ? null : Array.isArray(lsRaw) ? lsRaw[0] : (lsRaw as Record<string, unknown>);
  const role = rbacFromLeadsmartRole(ls?.role as string | undefined);

  return {
    id,
    email: row.email != null ? String(row.email) : user.email ?? null,
    full_name: row.full_name != null ? String(row.full_name) : null,
    role,
    tier: tier === "premium" || tier === "basic" ? tier : undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
    agent_id: ls?.agent_id != null ? String(ls.agent_id) : null,
    broker_id: ls?.broker_id != null ? String(ls.broker_id) : null,
    support_id: ls?.support_id != null ? String(ls.support_id) : null,
  };
}

/**
 * Returns the authenticated Supabase user + merged `user_profiles` / `leadsmart_users` / `propertytools_users`.
 */
export async function getCurrentUserWithProfile(): Promise<SessionUserWithProfile | null> {
  const supabase = supabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) return null;

  const { data: profileRow, error: profileErr } = await supabase
    .from("user_profiles")
    .select(
      "user_id,email,full_name,created_at,updated_at,is_active,leadsmart_users(role,agent_id,broker_id,support_id),propertytools_users(tier)"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("[getCurrentUserWithProfile] user_profiles:", profileErr.message);
  }

  if (profileRow) {
    const ptRaw = (profileRow as { propertytools_users?: { tier?: string } | { tier?: string }[] | null })
      .propertytools_users;
    const pt = ptRaw == null ? null : Array.isArray(ptRaw) ? ptRaw[0] : ptRaw;
    const tier = pt?.tier ?? null;
    // Cross-app auto-provision: an authenticated user (e.g. a CloseBoss agent)
    // with no PropertyTools account yet gets a free `basic` account + membership
    // registered, so the shared source of truth reflects that they use this app.
    if (!tier) {
      await ensureFreePropertytoolsAccount(user.id);
    }
    return {
      user,
      profile: normalizeProfileRow(profileRow as Record<string, unknown>, user, tier),
    };
  }

  // No user_profiles row at all — still an authenticated user opening the app.
  await ensureFreePropertytoolsAccount(user.id);

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName = fullNameFromUserMetadata(meta);

  const synthetic: ProfileRow = {
    id: user.id,
    email: user.email ?? null,
    full_name: fullName,
    role: "consumer",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agent_id: null,
    broker_id: null,
    support_id: null,
  };

  return { user, profile: synthetic };
}

export {
  getCurrentUserWithRole,
  type AppRole,
  type CurrentUserWithRole,
} from "./getCurrentUserRole";
