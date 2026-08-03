import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  acknowledgeVoiceClone,
  getVoiceCloneState,
  setUseClonedVoice,
  setVoiceCloneConsent,
  startVoiceCloneFromTwin,
} from "@/lib/agent-voice/voiceClone";

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
    const { agentId } = await getCurrentAgentContext();
    const id = String(agentId);
    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      value?: unknown;
      on?: unknown;
    };
    const action = typeof body.action === "string" ? body.action : "";

    switch (action) {
      case "consent": {
        const state = await setVoiceCloneConsent(id, body.value === true);
        return NextResponse.json({ ok: true, ...state });
      }
      case "start": {
        const state = await startVoiceCloneFromTwin(id);
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
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/voice-clone:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
