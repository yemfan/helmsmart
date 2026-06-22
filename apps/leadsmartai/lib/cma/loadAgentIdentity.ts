import "server-only";

import type { CmaPdfAgentIdentity } from "./buildCmaPdf";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Pull the agent's display identity for CMA PDFs / reports. All fields
 * are nullable — the PDF builders tolerate missing values gracefully.
 * Mirrors the pattern in /api/dashboard/listing-offers/[id]/net-to-seller-pdf.
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
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("first_name, last_name, brokerage_name, auth_user_id, license_number")
      .eq("id", agentId)
      .maybeSingle();
    const a = agentRow as
      | {
          first_name: string | null;
          last_name: string | null;
          brokerage_name: string | null;
          auth_user_id: string | null;
          license_number: string | null;
        }
      | null;
    if (!a) return blank;

    const identity: CmaPdfAgentIdentity = {
      name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || null,
      brokerage: a.brokerage_name ?? null,
      phone: null,
      email: null,
      licenseNumber: a.license_number ?? null,
    };

    if (a.auth_user_id) {
      const [{ data: authUser }, { data: profileRow }] = await Promise.all([
        supabaseAdmin.auth.admin.getUserById(a.auth_user_id),
        supabaseAdmin
          .from("user_profiles")
          .select("phone")
          .eq("user_id", a.auth_user_id)
          .maybeSingle(),
      ]);
      identity.email = authUser?.user?.email ?? null;
      identity.phone =
        (profileRow as { phone: string | null } | null)?.phone ?? null;
    }

    return identity;
  } catch (e) {
    console.warn("[cma] loadAgentIdentity failed:", e);
    return blank;
  }
}
