import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getListingById } from "@/lib/listings/service";
import { voiceoverConfigured, generateListingScript, buildListingVoiceover } from "@/lib/listings/adVoiceover";

// Script drafting is quick; the build step runs TTS + a fal compose render, so
// give it room under the ceiling (still one request, not a fan-out).
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/dashboard/listings/[id]/ad-voiceover
 *   { action: "script" }            → draft + persist a narration script (cheap)
 *   { action: "build", script? }    → speak the script (cloned voice, else
 *                                      default) and mux it onto the tour
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { agentId } = await getCurrentAgentContext();
    const { id } = await ctx.params;

    const listing = await getListingById(String(agentId), id);
    if (!listing) return NextResponse.json({ ok: false, error: "Listing not found" }, { status: 404 });

    if (!voiceoverConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Voiceover isn't configured yet (missing FAL_KEY or ELEVENLABS_API_KEY)." },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { action?: unknown; script?: unknown };
    const action = body.action === "build" ? "build" : "script";

    if (action === "script") {
      const { script } = await generateListingScript(String(agentId), id);
      return NextResponse.json({ ok: true, script });
    }

    const scriptOverride = typeof body.script === "string" ? body.script : undefined;
    const { url, script, voice } = await buildListingVoiceover(String(agentId), id, scriptOverride);
    return NextResponse.json({ ok: true, url, script, voice });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/dashboard/listings/[id]/ad-voiceover:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
