import "server-only";

import { userHasCrmFeature } from "@/lib/billing/subscriptionAccess";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Feature key that unlocks Signature-tier social post customization:
 *   - bring your own image (replace the branded card), and
 *   - brand kit (logo + brand color) on the generated card.
 *
 * Included in the `signature` and `team` plans' feature arrays (lib/billing/plans.ts).
 */
export const SOCIAL_CUSTOMIZATION_FEATURE = "social_customization" as const;

/**
 * Whether the agent's plan unlocks social post customization.
 *
 * For the cron / render path there's no request session, so we resolve the
 * agent's `auth_user_id` from the agents table and reuse the same feature gate
 * (`userHasCrmFeature`) the request-scoped `requireCrmFeature` uses. Fail-closed:
 * a missing agent row, a read error, or a resolve failure returns false so the
 * default (non-Signature) branded card is used.
 */
export async function agentHasSocialCustomization(
  agentId: string | number | null | undefined,
): Promise<boolean> {
  if (agentId == null || agentId === "") return false;
  try {
    const { data, error } = await supabaseAdmin
      .from("agents")
      .select("auth_user_id")
      .eq("id", agentId as never)
      .maybeSingle();
    if (error || !data) return false;
    const userId = (data as { auth_user_id?: unknown }).auth_user_id;
    if (typeof userId !== "string" || !userId.trim()) return false;
    return await userHasCrmFeature(userId, SOCIAL_CUSTOMIZATION_FEATURE);
  } catch {
    return false;
  }
}
