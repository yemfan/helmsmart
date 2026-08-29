import "server-only";

import { loadAgentSignatureProfile } from "@/lib/signatures/loadProfile";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Agent profile + contact block for the seller presentation "About your
 * agent" section. Reuses the signature profile (name / brokerage / brand /
 * phone / email / headshot / logo) and adds the license number.
 *
 * All fields nullable — the renderer hides blanks. Never throws.
 */
export type PresentationAgent = {
  name: string | null;
  brokerage: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
};

export async function loadPresentationAgent(
  agentId: string | number,
): Promise<PresentationAgent> {
  const blank: PresentationAgent = {
    name: null,
    brokerage: null,
    phone: null,
    email: null,
    licenseNumber: null,
    photoUrl: null,
    logoUrl: null,
  };

  try {
    // The licence lives on `leadsmart_users`, NOT on `agents`. This selected
    // `agents.license_number` — a column that does not exist — so PostgREST
    // returned 42703, the error landed in `.error` rather than throwing, and
    // the licence silently read as null on every seller presentation ever
    // rendered. Reached via agents.auth_user_id -> leadsmart_users.user_id.
    const [profile, agentRow] = await Promise.all([
      loadAgentSignatureProfile(agentId),
      supabaseAdmin
        .from("agents")
        .select("auth_user_id")
        .eq("id", agentId as never)
        .maybeSingle(),
    ]);

    const authUserId =
      (agentRow.data as { auth_user_id: string | null } | null)?.auth_user_id ?? null;

    let licenseNumber: string | null = null;
    if (authUserId) {
      const { data: licenseRow } = await supabaseAdmin
        .from("leadsmart_users")
        .select("license_number")
        .eq("user_id", authUserId as never)
        .maybeSingle();
      licenseNumber =
        (licenseRow as { license_number: string | null } | null)?.license_number?.trim() ||
        null;
    }

    if (!profile) return { ...blank, licenseNumber };

    return {
      name: profile.fullName?.trim() || null,
      // Prefer the agent's brand name, fall back to brokerage.
      brokerage: profile.brandName?.trim() || profile.brokerage?.trim() || null,
      phone: profile.phone ?? null,
      email: profile.email ?? null,
      licenseNumber,
      photoUrl: profile.agentPhotoUrl ?? null,
      logoUrl: profile.logoUrl ?? null,
    };
  } catch (e) {
    console.warn("[loadPresentationAgent] failed:", e);
    return blank;
  }
}
