import { NextResponse } from "next/server";
import {
  getAgentContextFromRequest,
  getCurrentAgentContext,
} from "@/lib/dashboardService";
import {
  createListing,
  listListingsForAgent,
  type CreateListingInput,
} from "@/lib/listings/service";

export const runtime = "nodejs";

/*
 * Bearer-aware: `getAgentContextFromRequest` prefers an Authorization header
 * and falls back to the cookie session, so the CloseBoss app reads this list
 * through the same route the dashboard does. Duplicating it under
 * /api/mobile would have meant two queries to keep in step, and they drift —
 * the mobile CMA spent months answering a different question from the web's.
 */
/**
 * GET /api/dashboard/listings
 * The agent's listings, newest first, with showing counters.
 *
 * This route only ever had a POST — the dashboard page reads the service
 * directly as a server component, so nothing needed the list over HTTP until
 * the app's Deals tab did.
 */
export async function GET(req: Request) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const listings = await listListingsForAgent(String(agentId));
    return NextResponse.json({ ok: true, listings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/listings:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/listings
 *
 * Creates a new listing in the dedicated `listings` table (Phase 2c
 * of the listings/transactions split). Replaces the previous flow
 * where the new-transaction form posted to /api/dashboard/transactions
 * with `transaction_type='listing_rep'` — listings now live in
 * their own table from the moment they're created.
 *
 * Body shape mirrors CreateListingInput minus `agentId` (we resolve
 * that from the session).
 *
 * 400 when contactId or propertyAddress are missing.
 * Returns the freshly-created listing's full detail shape.
 */
export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as Partial<
      Omit<CreateListingInput, "agentId">
    >;

    if (!body.contactId || !body.propertyAddress) {
      return NextResponse.json(
        { ok: false, error: "contactId and propertyAddress are required." },
        { status: 400 },
      );
    }

    const listing = await createListing({
      agentId,
      contactId: String(body.contactId),
      propertyAddress: String(body.propertyAddress),
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      mlsNumber: body.mlsNumber ?? null,
      mlsUrl: body.mlsUrl ?? null,
      listPrice: body.listPrice ?? null,
      listingStartDate: body.listingStartDate ?? null,
      listingEndDate: body.listingEndDate ?? null,
      status: body.status,
      commissionPct: body.commissionPct ?? null,
      notes: body.notes ?? null,
    });

    return NextResponse.json({ ok: true, listing });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listings:", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
