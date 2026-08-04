import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { requireMobileAgent } from "@/lib/mobile/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Mobile signed-upload minter — the Bearer-auth counterpart of
 * /api/dashboard/uploads/sign. Lets the app send a file (e.g. the digital-twin
 * intro video) DIRECTLY to Supabase Storage, bypassing Vercel's ~4.5 MB
 * serverless body cap. The client picks a `kind`, not a bucket/path; each kind
 * maps to a fixed bucket + agent-scoped prefix, and the consuming route
 * re-validates the returned path's prefix.
 */

type KindSpec = { bucket: string; prefix: (agentId: string) => string };

const KINDS: Record<string, KindSpec> = {
  // Private — the agent's intro video (their likeness/voice); read back by the
  // digital-twin processor via a short-lived signed URL, never public.
  agent_intro_video: { bucket: "lead-media", prefix: (a) => `digital-twin/${a}` },
};

function extFromName(name: string): string {
  const e = (name.toLowerCase().split(".").pop() ?? "").replace(/[^a-z0-9]/g, "");
  return e && e.length <= 5 ? `.${e}` : "";
}

export async function POST(req: Request) {
  const auth = await requireMobileAgent(req);
  if (auth.ok === false) return auth.response;

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; fileName?: unknown };
  const kind = typeof body.kind === "string" ? body.kind : "";
  const spec = KINDS[kind];
  if (!spec) {
    return NextResponse.json({ ok: false, success: false, error: "Unknown upload kind" }, { status: 400 });
  }
  const fileName = typeof body.fileName === "string" ? body.fileName : "upload";

  const path = `${spec.prefix(auth.ctx.agentId)}-${crypto.randomUUID()}${extFromName(fileName)}`;
  const { data, error } = await supabaseAdmin.storage.from(spec.bucket).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { ok: false, success: false, error: error?.message ?? "Could not create an upload URL." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, success: true, bucket: spec.bucket, path: data.path, token: data.token });
}
