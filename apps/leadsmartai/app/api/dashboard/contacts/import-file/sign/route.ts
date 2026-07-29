import { NextResponse } from "next/server";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Issues a signed upload URL so the browser can send the import file DIRECTLY to
 * Supabase Storage, bypassing Vercel's ~4.5 MB serverless request-body limit
 * (which was silently 413-ing larger PDFs/images on the multipart extract path).
 *
 * The tiny JSON request here carries no file bytes, so it never hits that limit.
 * The extract step then reads the uploaded object back server-side. Files land in
 * the private `lead-media` bucket under imports/<agentId>/… and are removed after
 * extraction.
 */
export const runtime = "nodejs";

const BUCKET = "lead-media";

function safeName(name: string): string {
  return (name || "upload")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "upload";
}

export async function POST(req: Request) {
  const auth = await getDashboardAgentContext();
  if (auth.ok === false) return auth.response;
  if (auth.planType === "free") {
    return NextResponse.json(
      { ok: false, error: "AI extraction requires Pro or higher." },
      { status: 402 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { fileName?: unknown };
  const fileName = typeof body.fileName === "string" ? body.fileName : "upload";

  // A random prefix keeps concurrent uploads from colliding; the agent scope
  // keeps the object owned by this agent for the audit trail.
  const rand = crypto.randomUUID();
  const path = `imports/${auth.agentId}/${rand}-${safeName(fileName)}`;

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Could not create an upload URL." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, bucket: BUCKET, path: data.path, token: data.token });
}
