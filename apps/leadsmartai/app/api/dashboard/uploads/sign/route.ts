import { NextResponse } from "next/server";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Shared signed-upload minter. Lets the browser send a file DIRECTLY to Supabase
 * Storage, bypassing Vercel's ~4.5 MB serverless request-body cap (which silently
 * 413s larger multipart uploads). This JSON request carries no bytes.
 *
 * The client picks a `kind`, NOT a bucket/path — each kind maps to a fixed
 * bucket + agent-scoped prefix here, so a caller can't target arbitrary storage.
 * The consuming route validates the returned path's prefix before trusting it.
 */
export const runtime = "nodejs";

type KindSpec = { bucket: string; prefix: (agentId: string) => string };

const KINDS: Record<string, KindSpec> = {
  // Public bucket — the final home for brand ad photos (served by URL).
  ad_photo: { bucket: "social-images", prefix: (a) => `${a}/ad-photo` },
  // Public bucket — uploaded video for the branded-clip editor. Must be publicly
  // fetchable while Remotion Lambda downloads it during the render.
  video_upload: { bucket: "social-images", prefix: (a) => `videos/${a}/clip` },
  // Private bucket — transient docs read back + deleted server-side.
  contact_import: { bucket: "lead-media", prefix: (a) => `imports/${a}` },
  listing_pdf: { bucket: "lead-media", prefix: (a) => `listings/${a}` },
  offer_pdf: { bucket: "lead-media", prefix: (a) => `offers/${a}` },
  contract_pdf: { bucket: "lead-media", prefix: (a) => `contracts/${a}` },
  // Private — the agent's intro video (their likeness/voice). Never public;
  // the digital-twin processor reads it via a short-lived signed URL.
  agent_intro_video: { bucket: "lead-media", prefix: (a) => `digital-twin/${a}` },
  // Private — the agent's portrait photo, an alternative likeness source for a
  // Lifelike avatar when they'd rather not film an intro video. Same folder,
  // same consent gate as the video.
  agent_portrait: { bucket: "lead-media", prefix: (a) => `digital-twin/${a}` },
};

function extFromName(name: string): string {
  const e = (name.toLowerCase().split(".").pop() ?? "").replace(/[^a-z0-9]/g, "");
  return e && e.length <= 5 ? `.${e}` : "";
}

export async function POST(req: Request) {
  const auth = await getDashboardAgentContext();
  if (auth.ok === false) return auth.response;

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; fileName?: unknown };
  const kind = typeof body.kind === "string" ? body.kind : "";
  const spec = KINDS[kind];
  if (!spec) {
    return NextResponse.json({ ok: false, error: "Unknown upload kind" }, { status: 400 });
  }
  const fileName = typeof body.fileName === "string" ? body.fileName : "upload";

  const rand = crypto.randomUUID();
  const path = `${spec.prefix(auth.agentId)}-${rand}${extFromName(fileName)}`;

  const { data, error } = await supabaseAdmin.storage.from(spec.bucket).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Could not create an upload URL." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, bucket: spec.bucket, path: data.path, token: data.token });
}
