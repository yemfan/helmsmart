import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { EMAIL_BRAND } from "@/lib/email";

/**
 * The name an agent's own clients should see on an automated message.
 *
 * Anything that reaches a lead or a client signs with the AGENT's brand, never
 * the platform's. A seller who gets a wire-fraud warning or a follow-up text
 * should read the name of the person they hired; the software vendor has no
 * business in that message, and until now several of those messages said
 * "LeadSmart AI" — a brand that no longer exists.
 *
 * Messages that go to the AGENT are the opposite case: there, naming the
 * platform is correct, so those keep EMAIL_BRAND directly rather than calling
 * this.
 *
 * Falls back to EMAIL_BRAND when the agent has no brand set, so a message is
 * never signed with an empty string.
 */
export async function agentBrandName(
  agentId: string | number | null | undefined,
): Promise<string> {
  if (agentId === null || agentId === undefined || agentId === "") return EMAIL_BRAND;
  try {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("brand_name")
      .eq("id", agentId as never)
      .maybeSingle();
    const brand = (data as { brand_name?: string | null } | null)?.brand_name?.trim();
    return brand || EMAIL_BRAND;
  } catch {
    return EMAIL_BRAND;
  }
}
