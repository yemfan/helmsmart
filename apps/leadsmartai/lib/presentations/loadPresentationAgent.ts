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
    const [profile, licenseRow] = await Promise.all([
      loadAgentSignatureProfile(agentId),
      supabaseAdmin
        .from("agents")
        .select("license_number")
        .eq("id", agentId as never)
        .maybeSingle(),
    ]);

    const licenseNumber =
      (licenseRow.data as { license_number: string | null } | null)?.license_number ?? null;

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
