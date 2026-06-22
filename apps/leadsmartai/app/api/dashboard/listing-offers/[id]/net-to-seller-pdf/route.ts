import { fetchListingPhoto } from "@/lib/cma/streetViewPhoto";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { buildNetToSellerPdf } from "@/lib/listing-offers/buildNetToSellerPdf";
import { getListingOfferWithCounters } from "@/lib/listing-offers/service";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/listing-offers/[id]/net-to-seller-pdf
 *   ?commissionPct=5&titleEscrowPct=1&transferTaxPct=0.11&otherCostsFlat=0
 *
 * Streams a one-page PDF the agent can show / hand to the seller to
 * confirm terms + estimated net before formally accepting. All four
 * assumption params are optional; defaults come from
 * DEFAULT_NET_TO_SELLER_ASSUMPTIONS (5% / 1% / 0.11% / $0).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;

    const result = await getListingOfferWithCounters(String(agentId), id);
    if (!result) return new Response("Not found", { status: 404 });

    // Parent listing — property address lives here (listing_offers
    // doesn't carry it). City/state/zip also come from the transaction.
    const { data: tx } = await supabaseAdmin
      .from("transactions")
      .select("property_address, city, state, zip")
      .eq("id", result.offer.transaction_id)
      .maybeSingle();
    const txRow = tx as {
      property_address: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    } | null;
    if (!txRow?.property_address) {
      return new Response("Parent listing not found", { status: 404 });
    }

    // Agent identity — pulled best-effort; blank fields just render as "—".
    let agentIdentity: {
      name: string | null;
      brokerage: string | null;
      phone: string | null;
      email: string | null;
      licenseNumber: string | null;
    } = {
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
      const a = agentRow as {
        first_name: string | null;
        last_name: string | null;
        brokerage_name: string | null;
        auth_user_id: string | null;
        license_number: string | null;
      } | null;
      if (a) {
        agentIdentity = {
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
          agentIdentity.email = authUser?.user?.email ?? null;
          agentIdentity.phone =
            (profileRow as { phone: string | null } | null)?.phone ?? null;
        }
      }
    } catch {
      // Non-fatal — PDF still generates with whatever we've got.
    }

    // Brokerage logo for the letterhead (best-effort; null hides it).
    let agentLogo = null;
    try {
      const profile = await loadPresentationAgent(String(agentId));
      agentLogo = await fetchListingPhoto(profile.logoUrl);
    } catch {
      /* non-fatal — header just renders without a logo */
    }

    const url = new URL(req.url);
    const readPct = (key: string): number | undefined => {
      const raw = url.searchParams.get(key);
      if (!raw) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const bytes = buildNetToSellerPdf({
      offer: result.offer,
      propertyAddress: txRow.property_address,
      assumptions: {
        commissionPct: readPct("commissionPct"),
        titleEscrowPct: readPct("titleEscrowPct"),
        transferTaxPct: readPct("transferTaxPct"),
        otherCostsFlat: readPct("otherCostsFlat"),
      },
      agent: agentIdentity,
      agentLogo,
      listingCity: txRow.city,
      listingState: txRow.state,
      listingZip: txRow.zip,
    });

    const addrSlug = txRow.property_address
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 60);
    const filename = `net-to-seller-${addrSlug}-${new Date().toISOString().slice(0, 10)}.pdf`;

    // jsPDF returns a Uint8Array; wrap to satisfy the Blob constructor's
    // strict BodyInit typing under lib.dom.
    const pdfBlob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
    return new Response(pdfBlob, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("net-to-seller-pdf:", err);
    return new Response(message, { status: 500 });
  }
}
