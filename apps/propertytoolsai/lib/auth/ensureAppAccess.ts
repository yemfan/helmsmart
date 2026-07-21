import "server-only";

import { isSupabaseServiceConfigured, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Register free PropertyTools access + membership for an authenticated user who
 * doesn't have a PropertyTools account yet.
 *
 * The apps share one auth.users, so a user of a sibling app (CloseBoss, mobile)
 * arrives already authenticated. PropertyTools never locks anyone out — a
 * logged-in user is at least the `free` tier regardless — so this is the mirror
 * of the CloseBoss auto-provision: it materializes the `propertytools_users`
 * row + `app_memberships` entry so the shared source of truth reflects that they
 * now use PropertyTools.
 *
 * Idempotent, race-safe, and non-destructive: `propertytools_users.user_id` is
 * unique, so the ignore-on-conflict upsert never overwrites an existing
 * (possibly `premium`) tier. Best-effort — never throws into the auth path.
 */
export async function ensureFreePropertytoolsAccount(userId: string): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  try {
    // Free consumer tier — insert only if missing (won't clobber premium).
    // Also fires the app_memberships sync trigger.
    await supabaseAdmin
      .from("propertytools_users")
      .upsert({ user_id: userId, tier: "basic" } as never, {
        onConflict: "user_id",
        ignoreDuplicates: true,
      });

    // Explicit membership — don't rely solely on the trigger. Ignore if present.
    await supabaseAdmin.from("app_memberships").upsert(
      { user_id: userId, app: "propertytools", role: "basic", status: "active" } as never,
      { onConflict: "user_id,app", ignoreDuplicates: true },
    );
  } catch (e) {
    console.error("[ensureFreePropertytoolsAccount]", e);
  }
}
