import { NextRequest, NextResponse, after } from "next/server";
import { getAgentContextFromRequest } from "@/lib/dashboardService";
import { decideRunStep, cancelBossRun, continueBossRun } from "@/lib/boss/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The approved action executes inline (a send, a call queue) — allow headroom.
export const maxDuration = 300;

/**
 * POST { stepIndex, decision: "approved" | "rejected", note? }
 * POST { cancel: true } → cancel the whole run.
 * Dual-auth (session or mobile bearer), same as the sibling Boss routes.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getAgentContextFromRequest(req);
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      stepIndex?: unknown;
      decision?: unknown;
      note?: unknown;
      cancel?: unknown;
    };

    if (body.cancel === true) {
      const ok = await cancelBossRun(String(agentId), id);
      return ok
        ? NextResponse.json({ ok: true, status: "cancelled" })
        : NextResponse.json({ ok: false, error: "Run can't be cancelled." }, { status: 400 });
    }

    const stepIndex = Number(body.stepIndex);
    const decision = body.decision === "approved" ? "approved" : body.decision === "rejected" ? "rejected" : null;
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || !decision) {
      return NextResponse.json(
        { ok: false, error: "stepIndex and decision (approved|rejected) required." },
        { status: 400 },
      );
    }
    const result = await decideRunStep({
      agentId: String(agentId),
      runId: id,
      stepIndex,
      decision,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : undefined,
    });
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    // Resume the loop after the response, in-process (fresh HTTP self-kicks
    // only happen on soft-deadline chunking inside the engine). Decisions on
    // already-finished runs (overnight inbox) don't reopen the loop.
    if (result.status === "running") {
      after(async () => {
        try {
          await continueBossRun(id);
        } catch (e) {
          console.error("[boss-run] resume after decision failed:", e);
        }
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
