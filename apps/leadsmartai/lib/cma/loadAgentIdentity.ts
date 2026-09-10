import "server-only";

import type { CmaPdfAgentIdentity } from "./buildCmaPdf";
import { loadAgentSignatureProfile } from "@/lib/signatures/loadProfile";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadAgentLicense } from "@/lib/teams/license.server";

/**
 * The agent's display identity for CMA PDFs, the CMA email sign-off, the
 * net-to-seller PDF and the skill prompts. All fields are nullable — every
 * consumer tolerates a blank.
 *
 * Where each field really lives (the `agents` table has NO `first_name`,
 * `last_name`, `brokerage_name` or `license_number` — selecting them made
 * PostgREST answer 42703, and this loader handed back a blank identity on
 * every call):
 *
 *   name, email, phone   user_profiles (by agents.auth_user_id), via the
 *                        signature profile join; phone prefers agents.phone
 *   brokerage            agents.brand_name, else agents.brokerage, else
 *                        leadsmart_users.brokerage (the DRE record fills that
 *                        one in when the agent left it blank)
 *   licenseNumber        agent_licenses (what the agent saved on the team
 *                        onboarding board), else leadsmart_users.license_number
 *                        (the older home of the same value, still mirrored)
 */
export async function loadAgentIdentity(agentId: string): Promise<CmaPdfAgentIdentity> {
  const blank: CmaPdfAgentIdentity = {
    name: null,
    brokerage: null,
    phone: null,
    email: null,
    licenseNumber: null,
  };

  try {
    const [profile, license, agentRow] = await Promise.all([
      loadAgentSignatureProfile(agentId),
      loadAgentLicense(agentId),
      supabaseAdmin.from("agents").select("auth_user_id").eq("id", agentId as never).maybeSingle(),
    ]);

    const authUserId =
      (agentRow.data as { auth_user_id: string | null } | null)?.auth_user_id ?? null;

    let licenseNumber = license?.number?.trim() || null;
    let brokerage = profile?.brandName?.trim() || profile?.brokerage?.trim() || null;
    let email = profile?.email?.trim() || null;

    if (authUserId && (!licenseNumber || !brokerage)) {
      const { data } = await supabaseAdmin
        .from("leadsmart_users")
        .select("license_number, brokerage")
        .eq("user_id", authUserId as never)
        .maybeSingle();
      const lu = data as { license_number: string | null; brokerage: string | null } | null;
      licenseNumber = licenseNumber || lu?.license_number?.trim() || null;
      brokerage = brokerage || lu?.brokerage?.trim() || null;
    }

    if (authUserId && !email) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(authUserId);
      email = data?.user?.email ?? null;
    }

    if (!profile) return { ...blank, brokerage, email, licenseNumber };

    return {
      name: profile.fullName?.trim() || null,
      brokerage,
      phone: profile.phone?.trim() || null,
      email,
      licenseNumber,
    };
  } catch (e) {
    console.warn("[cma] loadAgentIdentity failed:", e);
    return blank;
  }
}
