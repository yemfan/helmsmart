import { NextResponse } from "next/server";

import { requireCrmFeature } from "@/lib/billing/guard";
import { SOCIAL_CUSTOMIZATION_FEATURE } from "@/lib/social/customization";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/** Max accepted upload size (~8MB) for a bring-your-own social image. */
const MAX_BYTES = 8 * 1024 * 1024;

/** Allowed image content types → file extension for the storage path. */
const EXT_BY_TYPE: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

/** Tiny stable-ish hash of the bytes so re-uploads don't collide on the same path. */
function shortHash(bytes: Uint8Array): string {
  let h = 2166136261 >>> 0; // FNV-1a
  const step = bytes.length > 4096 ? Math.floor(bytes.length / 4096) : 1;
  for (let i = 0; i < bytes.length; i += step) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * POST /api/social/recommendation/[id]/media
 *
 * Signature-tier "bring your own image": replace a recommendation's branded
 * card with an image the agent uploads. Agent-authed + feature-gated on
 * `social_customization` (returns the shared 402 for non-Signature tiers).
 *
 * Accepts multipart FormData with a `file` field (an image, ≤ ~8MB). Uploads to
 * the `social-images` bucket (service-role) at
 * `${agentId}/custom-${recId}-${shorthash}.{png|jpg|webp}` and updates the rec
 * (scoped to the agent): image_url = publicUrl, image_source = 'custom'.
 *
 * Returns { ok:true, imageUrl } on success.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // Gate: Signature/Team only. 401 when unauthenticated, 402 when unentitled.
  const gate = await requireCrmFeature(SOCIAL_CUSTOMIZATION_FEATURE);
  if (!gate.ok) return gate.response;
  const agentId = String(gate.ctx.agentId);

  try {
    const { id: recId } = await ctx.params;

    // Parse the multipart body.
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Expected a multipart form upload with a 'file' field." },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "No image file provided." },
        { status: 400 },
      );
    }

    const contentType = (file.type || "").toLowerCase();
    const ext = EXT_BY_TYPE[contentType];
    if (!ext) {
      return NextResponse.json(
        { ok: false, error: "Please upload a PNG, JPG, or WebP image." },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Image is too large. Please keep it under 8MB." },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json(
        { ok: false, error: "The uploaded image was empty." },
        { status: 400 },
      );
    }

    // Verify the rec exists AND belongs to this agent BEFORE writing anything.
    const { data: recRow, error: recErr } = await supabaseServer
      .from("social_post_recommendations")
      .select("id")
      .eq("id", recId)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (recErr) throw recErr;
    if (!recRow) {
      return NextResponse.json(
        { ok: false, error: "Recommendation not found." },
        { status: 404 },
      );
    }

    // Upload to the social-images bucket (service-role storage).
    const path = `${agentId}/custom-${recId}-${shortHash(bytes)}.${ext}`;
    const { error: upErr } = await supabaseServer.storage
      .from("social-images")
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) throw upErr;

    const imageUrl = supabaseServer.storage
      .from("social-images")
      .getPublicUrl(path).data.publicUrl;

    // Point the rec at the custom image (agent-scoped update).
    const { data: updated, error: updErr } = await supabaseServer
      .from("social_post_recommendations")
      .update({ image_url: imageUrl, image_source: "custom" })
      .eq("id", recId)
      .eq("agent_id", agentId)
      .select("id")
      .maybeSingle();
    if (updErr) throw updErr;
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Recommendation not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, imageUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[social] custom media upload failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
