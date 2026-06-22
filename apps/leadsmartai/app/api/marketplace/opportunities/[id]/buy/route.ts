import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserFromRequest } from "@/lib/authFromRequest";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { sendInitialSmsAfterPurchase } from "@/lib/smsAutoFollow";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    // Resolve the agent from the SAME (Bearer-aware) user the purchase is
    // charged to — otherwise a Bearer ≠ cookie request would buy with one
    // user's id but another's agent_id. See lib/authFromRequest.ts.
    const { agentId } = await getCurrentAgentContext(user);
    const { id: opportunityId } = await ctx.params;
    if (!opportunityId) {
      return NextResponse.json({ ok: false, error: "Opportunity id is required" }, { status: 400 });
    }

    const { data, error } = await supabaseServer.rpc("buy_opportunity", {
      p_user_id: user.id,
      p_agent_id: agentId as any,
      p_opportunity_id: opportunityId,
    } as any);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message ?? "Failed to buy opportunity" },
        { status: 500 }
      );
    }

    const result = data as any;
    const ok = result?.ok === true;
    if (!ok) {
      const statusCode = Number(result?.status_code ?? 400);
      return NextResponse.json(
        {
          ok: false,
          error: result?.message ?? "Purchase failed",
          status_code: statusCode,
          plan: result?.plan ?? null,
          tokens_remaining: result?.tokens_remaining ?? null,
        },
        { status: Number.isFinite(statusCode) ? statusCode : 400 }
      );
    }

    // Trigger AI SMS auto-follow immediately after purchase (best-effort).
    try {
      const leadId = String(result?.contact_id ?? "").trim();
      if (leadId) {
        // Fire-and-forget to keep purchase response fast while still triggering within seconds.
        void sendInitialSmsAfterPurchase(leadId);
      }
    } catch {}

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

