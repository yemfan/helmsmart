import { NextResponse } from "next/server";
import {
  getAgentContextFromRequest,
  getCurrentAgentContext,
} from "@/lib/dashboardService";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  createTransaction,
  listTransactionsForAgent,
  type CreateTransactionInput,
} from "@/lib/transactions/service";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/transactions
 * List all transactions for the signed-in agent, with task-completion
 * counters for the list view.
 */
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
    const items = await listTransactionsForAgent(String(agentId));
    return NextResponse.json({ ok: true, transactions: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("GET /api/dashboard/transactions:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/transactions
 * Create a new transaction. Seeds the buyer-rep checklist from
 * lib/transactions/seedTasks.ts in the same request so the agent
 * lands on a useful detail page immediately.
 *
 * Body: { contactId, propertyAddress, transactionType?, city?, state?,
 *         zip?, purchasePrice?, mutualAcceptanceDate?, closingDate?,
 *         notes? }
 */
export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const body = (await req.json().catch(() => ({}))) as Partial<
      CreateTransactionInput & {
        offerId?: string | null;
        /** Source listing id when this form was opened from a listing's
         *  accepted-offer flow. The route writes both directions of the
         *  link: listings.transaction_id ← created.id, and
         *  transactions.source_listing_id ← body.listingId. */
        listingId?: string | null;
        /** The specific accepted listing-side offer (so its
         *  transaction_id back-link gets set too — turns the offer
         *  into a "linked to deal" record for downstream queries). */
        listingOfferId?: string | null;
      }
    >;

    if (!body.contactId || !body.propertyAddress) {
      return NextResponse.json(
        { ok: false, error: "contactId and propertyAddress are required." },
        { status: 400 },
      );
    }

    const created = await createTransaction({
      agentId: String(agentId),
      contactId: String(body.contactId),
      propertyAddress: String(body.propertyAddress),
      transactionType: body.transactionType,
      city: body.city ?? null,
      state: body.state ?? null,
      zip: body.zip ?? null,
      purchasePrice: body.purchasePrice ?? null,
      listingStartDate: body.listingStartDate ?? null,
      mutualAcceptanceDate: body.mutualAcceptanceDate ?? null,
      closingDate: body.closingDate ?? null,
      notes: body.notes ?? null,
    });

    // Back-link offer → transaction when this form was opened from
    // the buyer-side ✓ Accept flow (`?offerId` in the URL).
    // Best-effort: a failed back-link doesn't fail the transaction
    // creation since the transaction is the user's primary intent.
    if (body.offerId) {
      try {
        await supabaseAdmin
          .from("offers")
          .update({
            transaction_id: created.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.offerId)
          .eq("agent_id", agentId);
      } catch (e) {
        console.warn(
          "[POST /transactions] back-link offer→transaction failed:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    // Back-link listing → transaction when this form was opened from
    // the listing-side ✓ Accept flow (?listingId + ?listingOfferId).
    // Three writes, all best-effort:
    //
    //   1. transactions.source_listing_id ← listingId
    //      (forward-link from deal back to source listing)
    //   2. listings.transaction_id ← created.id
    //      (back-link from listing to its post-acceptance deal)
    //   3. listing_offers.transaction_id ← created.id
    //      (turn the accepted offer into a linked record so
    //      downstream queries can find it from the transaction
    //      side too)
    if (body.listingId) {
      try {
        await supabaseAdmin
          .from("transactions")
          .update({
            source_listing_id: body.listingId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", created.id)
          .eq("agent_id", agentId);

        await supabaseAdmin
          .from("listings")
          .update({
            transaction_id: created.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.listingId)
          .eq("agent_id", agentId);

        if (body.listingOfferId) {
          await supabaseAdmin
            .from("listing_offers")
            .update({
              transaction_id: created.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", body.listingOfferId)
            .eq("agent_id", agentId);
        }
      } catch (e) {
        console.warn(
          "[POST /transactions] back-link listing→transaction failed:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    return NextResponse.json({ ok: true, transaction: created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/transactions:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
