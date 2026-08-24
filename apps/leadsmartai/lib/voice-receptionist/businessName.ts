import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * The business name the receptionist says on the phone.
 *
 * It used to be typed a second time into the receptionist panel, next to a
 * Chinese variant, and both defaulted to blank. A blank one fell through to
 * `getAgentDisplayName`, which reads `user_profiles.full_name` — so an agent
 * who skipped those fields had their AI answering with their PERSONAL name
 * instead of their business. Two places to write the same fact, and the less
 * obvious one silently won.
 *
 * Branding is the single source now: `agents.brand_name`, the same value that
 * signs emails and brands reports. Changing it in one place changes what
 * callers hear.
 *
 * Order: brand name, then the person's name, then a neutral phrase. Never
 * empty — "thanks for calling ." is worse than any of them.
 */

export const FALLBACK_ORG_NAME = "our team";

export async function getReceptionistBusinessName(
  agentId: string | number | null | undefined,
): Promise<string> {
  if (agentId === null || agentId === undefined || agentId === "") return FALLBACK_ORG_NAME;
  try {
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("brand_name, auth_user_id")
      .eq("id", agentId as never)
      .maybeSingle();

    const row = agent as { brand_name?: string | null; auth_user_id?: string | null } | null;
    const brand = row?.brand_name?.trim();
    if (brand) return brand;

    // No brand set yet — the person's own name is a better answer than a
    // generic one, and it is what the receptionist already fell back to.
    const uid = row?.auth_user_id;
    if (uid) {
      const { data: prof } = await supabaseAdmin
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", uid as never)
        .maybeSingle();
      const name = (prof as { full_name?: string | null } | null)?.full_name?.trim();
      if (name) return name;
    }
    return FALLBACK_ORG_NAME;
  } catch {
    return FALLBACK_ORG_NAME;
  }
}
