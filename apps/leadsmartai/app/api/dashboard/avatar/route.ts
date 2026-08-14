import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import {
  avatarConfigured,
  draftAvatarScript,
  getAvatarState,
  previewAvatarVoice,
  publishAvatarVideo,
  renderAvatarVideo,
} from "@/lib/agent/avatarStudio";
import { userHasCrmFeature, subscriptionRequiredResponse } from "@/lib/billing/subscriptionAccess";
import { withCreditsMetered, meteringEnforced, InsufficientCreditsError } from "@/lib/credits/metering";
import { CREDIT_COSTS } from "@/lib/credits/ledger";

// The lipsync render can take a couple of minutes.
export const runtime = "nodejs";
export const maxDuration = 300;

/** GET — current avatar-studio state (readiness + last script/video). */
export async function GET() {
  try {
    const { agentId, userId } = await getCurrentAgentContext();
    const [state, hasPremium] = await Promise.all([
      getAvatarState(String(agentId)),
      userHasCrmFeature(String(userId), "premium_avatar").catch(() => false),
    ]);
    // Under the usage model everything's included, so the premium enhancements
    // are available to everyone (the credit balance is the gate, not the plan).
    const premiumAvatar = hasPremium || meteringEnforced();
    return NextResponse.json({ ok: true, ...state, premiumAvatar });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * POST — drive the avatar studio.
 * Body: { action: "draft" | "preview" | "render", topic?, text?, audioPath? }
 *  - draft   (cheap): Claude writes a script from the brand profile
 *  - preview (cheap): ElevenLabs speaks it in the cloned voice
 *  - render  (paid) : fal lipsyncs the audio onto the intro video
 */
export async function POST(req: Request) {
  try {
    const { agentId, userId } = await getCurrentAgentContext();
    const id = String(agentId);

    if (!avatarConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Avatar isn't enabled yet (needs FAL_KEY + ELEVENLABS_API_KEY + ANTHROPIC_API_KEY)." },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      topic?: unknown;
      text?: unknown;
      audioPath?: unknown;
      caption?: unknown;
      sharpen?: unknown;
      photoAvatar?: unknown;
      voice?: unknown;
    };
    const action = typeof body.action === "string" ? body.action : "";
    const text = typeof body.text === "string" ? body.text : "";
    // Which voice speaks the script — the agent's clone or a stock preset.
    // Validated server-side in resolveVoiceId; unknown ids are rejected there.
    const voice = typeof body.voice === "string" ? body.voice : null;

    switch (action) {
      case "draft": {
        const topic = typeof body.topic === "string" ? body.topic : null;
        const script = await draftAvatarScript(id, topic);
        return NextResponse.json({ ok: true, script });
      }
      case "preview": {
        const out = await previewAvatarVoice(id, text, voice);
        return NextResponse.json({ ok: true, ...out });
      }
      case "render": {
        const audioPath = typeof body.audioPath === "string" ? body.audioPath : null;
        const sharpen = body.sharpen === true;
        const photoAvatar = body.photoAvatar === true;
        // Old model: premium enhancements are plan-gated. New usage model
        // (metering enforced): everything's included — the credit charge is the
        // only gate, so skip the entitlement check.
        if (
          (sharpen || photoAvatar) &&
          !meteringEnforced() &&
          !(await userHasCrmFeature(String(userId), "premium_avatar"))
        ) {
          return subscriptionRequiredResponse("premium_avatar");
        }
        // Reserve credits around the paid render (no-op unless metering is on).
        const out = await withCreditsMetered(String(userId), CREDIT_COSTS.twinAvatar, "twin", () =>
          renderAvatarVideo(id, text, audioPath, { sharpen, photoAvatar, voice }),
        );
        return NextResponse.json({ ok: true, ...out });
      }
      case "publish": {
        const caption = typeof body.caption === "string" ? body.caption : undefined;
        const out = await publishAvatarVideo(id, caption);
        // scheduled:0 with an error means no connected accounts — surface it, not a 500.
        return NextResponse.json({ ok: true, scheduled: out.scheduled, error: out.error ?? null });
      }
      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json({ ok: false, error: err.message, code: "INSUFFICIENT_CREDITS" }, { status: 402 });
    }
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/avatar:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
