import { NextResponse } from "next/server";

import { requireCrmFeature } from "@/lib/billing/guard";
import { SOCIAL_CUSTOMIZATION_FEATURE } from "@/lib/social/customization";
import { supabaseServer } from "@/lib/supabaseServer";
import { addAdPhoto, listAgentAdPhotos } from "@/lib/social/adPhotos";

/**
 * Brand photo pool for the "photo" ad preset.
 *
 *   GET  → list the agent's active ad photos.
 *   POST → upload a photo (multipart `file`, ≤8MB PNG/JPG/WebP) into the
 *          social-images bucket and index it in social_ad_photos.
 *
 * Signature/Team gated (same "bring your own image" capability as the custom
 * recommendation upload). Uploads via the service-role storage client.
 */
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

function shortHash(bytes: Uint8Array): string {
  let h = 2166136261 >>> 0;
  const step = bytes.length > 4096 ? Math.floor(bytes.length / 4096) : 1;
  for (let i = 0; i < bytes.length; i += step) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export async function GET() {
  const gate = await requireCrmFeature(SOCIAL_CUSTOMIZATION_FEATURE);
  if (!gate.ok) return gate.response;
  const photos = await listAgentAdPhotos(String(gate.ctx.agentId));
  return NextResponse.json({ ok: true, photos });
}

export async function POST(req: Request) {
  const gate = await requireCrmFeature(SOCIAL_CUSTOMIZATION_FEATURE);
  if (!gate.ok) return gate.response;
  const agentId = String(gate.ctx.agentId);

  try {
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
      return NextResponse.json({ ok: false, error: "No image file provided." }, { status: 400 });
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
      return NextResponse.json({ ok: false, error: "The uploaded image was empty." }, { status: 400 });
    }

    const label = typeof form.get("label") === "string" ? (form.get("label") as string) : null;
    const path = `${agentId}/ad-photo-${shortHash(bytes)}.${ext}`;
    const { error: upErr } = await supabaseServer.storage
      .from("social-images")
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) throw upErr;

    const url = supabaseServer.storage.from("social-images").getPublicUrl(path).data.publicUrl;
    const id = await addAdPhoto(agentId, url, label);
    return NextResponse.json({ ok: true, id, url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    console.error("[social] ad photo upload failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
