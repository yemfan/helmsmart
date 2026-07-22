import { NextResponse } from "next/server";

import { parseSignedRequest } from "@/lib/leads-gen/threads-oauth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/leads-gen/connect/threads/deauthorize
 *
 * Meta's "Uninstall / Deauthorize" callback. When a user removes the CloseBoss
 * app from their Threads account, Meta POSTs a `signed_request` here. We verify
 * it with the Threads app secret, then delete the matching social_accounts row
 * so the app stops treating the account as connected.
 *
 * Always returns 200 quickly — Meta only needs an ack; failing loudly would
 * make Meta retry a delete that already can't succeed.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    const signed = form?.get("signed_request");
    if (typeof signed !== "string") {
      return NextResponse.json({ ok: true });
    }
    const payload = parseSignedRequest(signed);
    const userId = payload?.user_id ? String(payload.user_id) : null;
    if (userId) {
      const { error } = await supabaseAdmin
        .from("social_accounts")
        .delete()
        .eq("platform", "threads")
        .eq("threads_user_id", userId);
      if (error) {
        console.warn("[threads/deauthorize] delete failed:", error.message);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[threads/deauthorize]", e);
    // Still ack — Meta retries on non-2xx, and there's nothing to retry.
    return NextResponse.json({ ok: true });
  }
}
