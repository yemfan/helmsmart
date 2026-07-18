import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cronAuth";
import { runActivationNudges } from "@/lib/activation/nudge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Activation nudge cron (daily): emails agents who signed up but haven't
 * finished setting up their AI team, focused on their next step. Reuses the
 * in-app activation engine so both channels agree. Auth mirrors sibling crons.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runActivationNudges();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[activation-nudge]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
