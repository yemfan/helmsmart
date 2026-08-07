import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  acknowledgeVoiceClone,
  getVoiceCloneState,
  setUseClonedVoice,
  setVoiceCloneConsent,
  startVoiceCloneFromTwin,
} from "@/lib/agent-voice/voiceClone";
import { userHasCrmFeature, subscriptionRequiredResponse } from "@/lib/billing/subscriptionAccess";
import { withCreditsMetered, meteringEnforced, InsufficientCreditsError } from "@/lib/credits/metering";
import { CREDIT_COSTS } from "@/lib/credits/ledger";

// Downloading the intro video + creating the ElevenLabs voice can take a bit.
export const runtime = "nodejs";
export const maxDuration = 180;

/** GET — current voice-clone state for the signed-in agent. */
export async function GET() {
  try {
    const { agentId } = await getCurrentAgentContext();
    const state = await getVoiceCloneState(String(agentId));
    return NextResponse.json({ ok: true, ...state });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST — drive the voice-clone lifecycle.
 * Body: { action: "consent" | "start" | "acknowledge" | "activate", value?, on? }
 */
export async function POST(req: Request) {
  try {
    const { agentId, userId } = await getCurrentAgentContext();
    const id = String(agentId);
    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      value?: unknown;
      on?: unknown;
      clean?: unknown;
    };
    const action = typeof body.action === "string" ? body.action : "";

    switch (action) {
      case "consent": {
        const state = await setVoiceCloneConsent(id, body.value === true);
        return NextResponse.json({ ok: true, ...state });
      }
      case "start": {
        const clean = body.clean === true;
        // Old model: "Clean my voice" is plan-gated. New usage model (metering
        // enforced): everything's included — the credit charge is the only gate.
        if (clean && !meteringEnforced() && !(await userHasCrmFeature(String(userId), "premium_avatar"))) {
          return subscriptionRequiredResponse("premium_avatar");
        }
        // Reserve credits around the paid clone (no-op unless metering is on).
        const state = await withCreditsMetered(String(userId), CREDIT_COSTS.voiceClone, "voice_clone", () =>
          startVoiceCloneFromTwin(id, { clean }),
        );
        return NextResponse.json({ ok: true, ...state });
      }
      case "acknowledge": {
        const state = await acknowledgeVoiceClone(id);
        return NextResponse.json({ ok: true, ...state });
      }
      case "activate": {
        const state = await setUseClonedVoice(id, body.on === true);
        return NextResponse.json({ ok: true, ...state });
      }
      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json({ ok: false, error: err.message, code: "INSUFFICIENT_CREDITS" }, { status: 402 });
    }
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/voice-clone:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
