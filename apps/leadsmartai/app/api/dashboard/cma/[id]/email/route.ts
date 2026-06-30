import { NextResponse } from "next/server";

import { getCmaForAgent } from "@/lib/cma/service";
import { isCredibleCmaValuation } from "@/lib/cma/types";
import { isSendCmaEmailFailure, sendCmaEmail } from "@/lib/cma/sendCmaEmail";
import { getCurrentAgentContext } from "@/lib/dashboardService";

export const runtime = "nodejs";

/**
 * POST /api/dashboard/cma/[id]/email
 *
 * Body: { to: string, message?: string }
 *
 * Sends the CMA to a seller email. Builds the PDF on the fly + attaches
 * it. The cover-note copy is rendered via `renderCmaEmail` (HTML +
 * plain-text), the seller's reply routes back to the agent's mailbox
 * (Reply-To header).
 *
 * Best-effort: if Resend isn't configured, the helper logs + returns
 * undefined; the API surfaces 502 in that case.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;

    const body = (await req.json().catch(() => ({}))) as {
      to?: unknown;
      message?: unknown;
    };
    const to = typeof body.to === "string" ? body.to.trim() : "";
    const message = typeof body.message === "string" ? body.message : "";

    if (!to) {
      return NextResponse.json(
        { ok: false, error: "Recipient email is required." },
        { status: 400 },
      );
    }

    const cma = await getCmaForAgent(String(agentId), id);
    if (!cma) {
      return NextResponse.json(
        { ok: false, error: "CMA not found." },
        { status: 404 },
      );
    }

    // Never email a non-credible ($0 / no-band) valuation to a seller.
    if (!isCredibleCmaValuation(cma.snapshot.valuation)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This CMA didn't return a reliable valuation, so it can't be sent. Regenerate it with a more complete address first.",
        },
        { status: 422 },
      );
    }

    const result = await sendCmaEmail({ cma, to, agentMessage: message });
    if (isSendCmaEmailFailure(result)) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, emailId: result.emailId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("cma email:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
