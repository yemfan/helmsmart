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

// The lipsync render can take a couple of minutes.
export const runtime = "nodejs";
export const maxDuration = 300;

/** GET — current avatar-studio state (readiness + last script/video). */
export async function GET() {
  try {
    const { agentId, userId } = await getCurrentAgentContext();
    const [state, premiumAvatar] = await Promise.all([
      getAvatarState(String(agentId)),
      userHasCrmFeature(String(userId), "premium_avatar").catch(() => false),
    ]);
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
    };
    const action = typeof body.action === "string" ? body.action : "";
    const text = typeof body.text === "string" ? body.text : "";

    switch (action) {
      case "draft": {
        const topic = typeof body.topic === "string" ? body.topic : null;
        const script = await draftAvatarScript(id, topic);
        return NextResponse.json({ ok: true, script });
      }
      case "preview": {
        const out = await previewAvatarVoice(id, text);
        return NextResponse.json({ ok: true, ...out });
      }
      case "render": {
        const audioPath = typeof body.audioPath === "string" ? body.audioPath : null;
        const sharpen = body.sharpen === true;
        const photoAvatar = body.photoAvatar === true;
        // Premium enhancements — gate server-side so the client can't bypass the
        // entitlement even if a toggle is forced on.
        if ((sharpen || photoAvatar) && !(await userHasCrmFeature(String(userId), "premium_avatar"))) {
          return subscriptionRequiredResponse("premium_avatar");
        }
        const out = await renderAvatarVideo(id, text, audioPath, { sharpen, photoAvatar });
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
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/avatar:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
