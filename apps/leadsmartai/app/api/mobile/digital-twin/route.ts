import { NextResponse } from "next/server";

import { requireMobileAgent } from "@/lib/mobile/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  digitalTwinConfigured,
  processDigitalTwin,
  saveBrandProfile,
  setDigitalTwinConsent,
  type BrandProfile,
} from "@/lib/agent/digitalTwin";

/**
 * Mobile counterpart of /api/dashboard/digital-twin. Bearer-auth in, the same
 * brand-profile-from-intro-video pipeline out — reuses the digitalTwin lib so the
 * app and the dashboard read/write the same agents.dt_* columns.
 *
 * The intro video is uploaded straight to Storage via /api/mobile/uploads/sign;
 * the app posts back only the storage path here.
 */
export const runtime = "nodejs";
export const maxDuration = 180;

const VIDEO_PREFIX_RE = /^digital-twin\//;

async function readTwin(agentId: string) {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("dt_intro_video_path, dt_consent, dt_brand_profile, dt_status, dt_error")
    .eq("id", agentId)
    .maybeSingle();
  return (data ?? null) as Record<string, unknown> | null;
}

/** GET — current digital-twin status + brand profile. */
export async function GET(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;
  try {
    const t = await readTwin(auth.ctx.agentId);
    return NextResponse.json({
      ok: true,
      configured: digitalTwinConfigured(),
      status: (t?.dt_status as string) ?? "idle",
      consent: Boolean(t?.dt_consent),
      hasVideo: Boolean(t?.dt_intro_video_path),
      profile: (t?.dt_brand_profile as BrandProfile | null) ?? null,
      error: (t?.dt_error as string | null) ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** POST — process an uploaded intro video into a brand profile. Body: { videoPath, consent }. */
export async function POST(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;
  try {
    if (!digitalTwinConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Digital twin isn't configured yet (needs FAL_KEY + ANTHROPIC_API_KEY)." },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { videoPath?: unknown; consent?: unknown };
    if (body.consent !== true) {
      return NextResponse.json(
        { ok: false, error: "You must consent to AI use of your likeness and voice first." },
        { status: 400 },
      );
    }
    const videoPath = typeof body.videoPath === "string" ? body.videoPath : "";
    // Own-likeness only: the path must be in this agent's private digital-twin prefix.
    if (!videoPath || !VIDEO_PREFIX_RE.test(videoPath) || !videoPath.includes(`/${auth.ctx.agentId}`)) {
      return NextResponse.json({ ok: false, error: "Upload your intro video first." }, { status: 400 });
    }

    await setDigitalTwinConsent(auth.ctx.agentId, true);

    const { data: prof } = await supabaseAdmin
      .from("agents")
      .select("brand_name")
      .eq("id", auth.ctx.agentId)
      .maybeSingle();
    const name = (prof as { brand_name?: string | null } | null)?.brand_name ?? null;

    const out = await processDigitalTwin(auth.ctx.agentId, videoPath, name);
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("POST /api/mobile/digital-twin:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** PATCH — save an edited brand profile, or update consent. */
export async function PATCH(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;
  try {
    const body = (await req.json().catch(() => ({}))) as { profile?: unknown; consent?: unknown };
    if (typeof body.consent === "boolean") {
      await setDigitalTwinConsent(auth.ctx.agentId, body.consent);
    }
    if (body.profile && typeof body.profile === "object") {
      const p = body.profile as Record<string, unknown>;
      const profile: BrandProfile = {
        bio: typeof p.bio === "string" ? p.bio.slice(0, 800) : "",
        specialties: Array.isArray(p.specialties)
          ? p.specialties.filter((s): s is string => typeof s === "string").slice(0, 6)
          : [],
        market: typeof p.market === "string" ? p.market.slice(0, 200) : "",
        tone: typeof p.tone === "string" ? p.tone.slice(0, 120) : "",
        tagline: typeof p.tagline === "string" ? p.tagline.slice(0, 200) : "",
      };
      await saveBrandProfile(auth.ctx.agentId, profile);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
