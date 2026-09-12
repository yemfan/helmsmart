import { NextResponse } from "next/server";
import {
  getAgentContextFromRequest,
  getCurrentAgentContext,
} from "@/lib/dashboardService";
import {
  createOffer,
  listOffersForAgent,
  type CreateOfferInput,
} from "@/lib/offers/service";
import type { OfferStatus } from "@/lib/offers/types";

export const runtime = "nodejs";

const VALID_STATUS_FILTERS = new Set([
  "draft",
  "submitted",
  "countered",
  "accepted",
  "rejected",
  "withdrawn",
  "expired",
  "active",
  "won",
  "lost",
  "all",
]);

/*
 * Bearer-aware: `getAgentContextFromRequest` prefers an Authorization header
 * and falls back to the cookie session, so the CloseBoss app reads this list
 * through the same route the dashboard does. Duplicating it under
 * /api/mobile would have meant two queries to keep in step, and they drift —
 * the mobile CMA spent months answering a different question from the web's.
 */
export async function GET(req: Request) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const url = new URL(req.url);
    const contactId = url.searchParams.get("contactId") || undefined;
    const rawStatus = url.searchParams.get("status");
    const status =
      rawStatus && VALID_STATUS_FILTERS.has(rawStatus)
        ? (rawStatus as OfferStatus | "active" | "won" | "lost" | "all")
        : undefined;
    const offers = await listOffersForAgent(String(agentId), { contactId, status });
    return NextResponse.json({ ok: true, offers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/offers:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as Partial<CreateOfferInput>;

    if (!body.contactId || !body.propertyAddress || body.offerPrice == null) {
      return NextResponse.json(
        {
          ok: false,
          error: "contactId, propertyAddress, and offerPrice are required.",
        },
        { status: 400 },
      );
    }

    const created = await createOffer({
      agentId: String(agentId),
      contactId: String(body.contactId),
      propertyAddress: String(body.propertyAddress),
      offerPrice: Number(body.offerPrice),
      showingId: body.showingId ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      mlsNumber: body.mlsNumber ?? null,
      mlsUrl: body.mlsUrl ?? null,
      listPrice: body.listPrice ?? null,
      earnestMoney: body.earnestMoney ?? null,
      downPayment: body.downPayment ?? null,
      financingType: body.financingType ?? null,
      closingDateProposed: body.closingDateProposed ?? null,
      inspectionContingency: body.inspectionContingency,
      appraisalContingency: body.appraisalContingency,
      loanContingency: body.loanContingency,
      contingencyNotes: body.contingencyNotes ?? null,
      offerExpiresAt: body.offerExpiresAt ?? null,
      notes: body.notes ?? null,
      submitNow: body.submitNow,
    });

    return NextResponse.json({ ok: true, offer: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/offers:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
