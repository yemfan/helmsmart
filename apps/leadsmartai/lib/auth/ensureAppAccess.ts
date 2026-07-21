import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAdminOrSupportRole } from "@/lib/rolePortalPaths";

/**
 * Auto-provision free CloseBoss (leadsmart) access for an authenticated user
 * who has no account here yet.
 *
 * The apps share one auth.users, so a user of a sibling app (PropertyTools,
 * mobile) arrives already authenticated but without a CloseBoss account. The
 * chosen cross-app behavior is AUTO-PROVISION: rather than lock them out, give
 * them a free account + membership so they land straight in.
 *
 * Idempotent and non-destructive: it only ADDS rows that are missing and never
 * overwrites an existing role/plan (so an admin/support/existing agent is
 * untouched). Returns the agents.id, or null if provisioning failed.
 */
export async function ensureFreeLeadsmartAccount(
  userId: string,
): Promise<string | null> {
  // 0. Never auto-convert staff into agents. Admin/support users legitimately
  //    have no agents row; returning null keeps the original no-agent flow (the
  //    dashboard layout redirects them to the admin portal).
  let existingRole: string | null = null;
  try {
    const lu = await supabaseAdmin
      .from("leadsmart_users")
      .select("role")
      .eq("user_id", userId as never)
      .maybeSingle();
    existingRole = (lu.data as { role?: string | null } | null)?.role ?? null;
    if (isAdminOrSupportRole(existingRole)) return null;
  } catch (e) {
    console.error("[ensureFreeLeadsmartAccount] role check:", e);
    // Fail closed on the role check — don't provision if we can't rule out staff.
    return null;
  }

  // 1. Free agent account (CloseBoss's free tier). Create only if missing;
  //    tolerate a concurrent create via a re-select.
  let agentId: string | null = null;
  try {
    const existing = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("auth_user_id", userId as never)
      .maybeSingle();
    agentId = existing.data ? String((existing.data as { id: unknown }).id) : null;

    if (!agentId) {
      const inserted = await supabaseAdmin
        .from("agents")
        .insert({ auth_user_id: userId, plan_type: "free" } as never)
        .select("id")
        .maybeSingle();
      if (inserted.data) {
        agentId = String((inserted.data as { id: unknown }).id);
      } else {
        // Lost a race — the row now exists; read it back.
        const again = await supabaseAdmin
          .from("agents")
          .select("id")
          .eq("auth_user_id", userId as never)
          .maybeSingle();
        agentId = again.data ? String((again.data as { id: unknown }).id) : null;
      }
    }
  } catch (e) {
    console.error("[ensureFreeLeadsmartAccount] agents:", e);
    return null;
  }

  // 2. Role row — only if absent, so we never clobber an admin/support role.
  //    (This also fires the membership sync trigger.)
  try {
    const lu = await supabaseAdmin
      .from("leadsmart_users")
      .select("user_id")
      .eq("user_id", userId as never)
      .maybeSingle();
    if (!lu.data) {
      await supabaseAdmin
        .from("leadsmart_users")
        .insert({ user_id: userId, role: "agent" } as never);
    }
  } catch (e) {
    console.error("[ensureFreeLeadsmartAccount] leadsmart_users:", e);
  }

  // 3. Explicit membership — don't rely solely on the trigger. Ignore if present.
  try {
    await supabaseAdmin.from("app_memberships").upsert(
      { user_id: userId, app: "leadsmart", role: "agent", status: "active" } as never,
      { onConflict: "user_id,app", ignoreDuplicates: true },
    );
  } catch (e) {
    console.error("[ensureFreeLeadsmartAccount] app_memberships:", e);
  }

  return agentId;
}
