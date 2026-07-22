import { NextResponse } from "next/server";

import { parseSignedRequest } from "@/lib/leads-gen/threads-oauth";
import { getSiteUrl } from "@/lib/siteUrl";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Meta's "Data Deletion Request" callback for the Threads app.
 *
 * POST: Meta sends a `signed_request` when a user requests deletion of their
 * data. We verify it, delete the matching social_accounts row, and respond in
 * the shape Meta requires — `{ url, confirmation_code }` — where `url` is a
 * human-viewable status page and `confirmation_code` lets the user reference
 * the request. (We store no Threads content, so a connection row is the only
 * data to remove.)
 *
 * GET: the status page Meta's `url` points at, so a user can confirm the
 * deletion completed.
 */
function statusUrl(code: string): string {
  const base = getSiteUrl().replace(/\/$/, "");
  return `${base}/api/leads-gen/connect/threads/data-deletion?code=${encodeURIComponent(code)}`;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    const signed = form?.get("signed_request");
    if (typeof signed !== "string") {
      return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });
    }
    const payload = parseSignedRequest(signed);
    if (!payload) {
      return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
    }
    const userId = payload.user_id ? String(payload.user_id) : null;
    if (userId) {
      const { error } = await supabaseAdmin
        .from("social_accounts")
        .delete()
        .eq("platform", "threads")
        .eq("threads_user_id", userId);
      if (error) {
        console.warn("[threads/data-deletion] delete failed:", error.message);
      }
    }

    // Confirmation code Meta echoes back to the user. Deterministic on the
    // user id so a repeat request resolves to the same reference.
    const code = `threads-${userId ?? "unknown"}`;
    return NextResponse.json({ url: statusUrl(code), confirmation_code: code });
  } catch (e) {
    console.error("[threads/data-deletion]", e);
    return NextResponse.json({ error: "Data deletion request failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const body = `<!doctype html><html><head><meta charset="utf-8"><title>Threads data deletion — CloseBoss</title></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#1B2A4A"><h1>Data deletion complete</h1><p>Any CloseBoss connection to your Threads account has been removed. We do not store your Threads posts or content.</p>${
    code ? `<p style="color:#64748b">Reference: ${code.replace(/[<>&"]/g, "")}</p>` : ""
  }</body></html>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
