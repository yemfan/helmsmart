import { NextResponse } from "next/server";

import { getCurrentAgentContext } from "@/lib/dashboardService";
import { sendBuyerListings } from "@/lib/house-search/buyerEmail";
import type { HouseListing } from "@/lib/house-search/types";

export const runtime = "nodejs";

/**
 * POST /api/dashboard/house-search/email
 *
 * Emails a buyer the selected House Search listings. Body:
 *   { to, buyerFirstName?, query, note?, listings: HouseListing[] }
 */
export async function POST(req: Request) {
  try {
    const { agentId } = await getCurrentAgentContext();

    const body = (await req.json().catch(() => ({}))) as {
      to?: unknown;
      buyerFirstName?: unknown;
      query?: unknown;
      note?: unknown;
      listings?: unknown;
    };

    const to = typeof body.to === "string" ? body.to.trim() : "";
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ ok: false, error: "A valid buyer email is required." }, { status: 400 });
    }
    const listings = Array.isArray(body.listings) ? (body.listings as HouseListing[]) : [];
    if (listings.length === 0) {
      return NextResponse.json({ ok: false, error: "Select at least one listing to send." }, { status: 400 });
    }

    const result = await sendBuyerListings({
      to,
      buyerFirstName: typeof body.buyerFirstName === "string" ? body.buyerFirstName.trim() || null : null,
      query: typeof body.query === "string" ? body.query.trim() : "",
      note: typeof body.note === "string" ? body.note.trim() || null : null,
      listings,
      agentId,
    });

    if (result === undefined) {
      // sendEmail no-ops when RESEND_API_KEY is unset.
      return NextResponse.json(
        { ok: false, error: "Email isn't configured on this environment (RESEND_API_KEY missing)." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, id: result.id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("house-search/email:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
