import { createClient } from "@/lib/supabase/server";

/**
 * Update the current organization and PROVE something changed.
 *
 * Settings writes here go through the RLS-enforced client. When a policy does
 * not permit the write, Postgres does not error — the statement simply matches
 * zero rows, and Supabase reports that as success. Every caller was doing:
 *
 *     await supabase.from("organizations").update({ ... }).eq("id", orgId);
 *
 * discarding the result entirely, so "saved nothing" and "saved" were the same
 * outcome. The settings form said saved, the value stayed NULL, and the only
 * visible symptom was a feature quietly refusing to work later — which is how
 * the AI Voice Agent came to show an enabled toggle beside a warning that no
 * Twilio number was set.
 *
 * `.select("id")` is the load-bearing part. Without asking for rows back there
 * is no way to distinguish a forbidden update from a successful one; with it,
 * an empty array is the signal.
 */
export type OrgUpdateResult = { ok: true } | { ok: false; error: string };

export async function updateOrg(
  orgId: string,
  patch: Record<string, unknown>,
  /** Names the caller in logs — a silent save is hard enough to trace already. */
  context: string,
): Promise<OrgUpdateResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .update(patch)
    .eq("id", orgId)
    .select("id");

  if (error) {
    console.error(`[${context}] organizations update failed:`, error.message);
    return { ok: false, error: error.message };
  }

  if (!data || data.length === 0) {
    // No error and no rows: the row exists but this user may not write it, or
    // the org id in the cookie does not resolve. Both are permission problems
    // from the user's point of view and neither should look like success.
    console.error(`[${context}] organizations update changed no rows`, { orgId });
    return {
      ok: false,
      error: "Couldn't save — you may not have permission for this organization.",
    };
  }

  return { ok: true };
}
