import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * One-click unsubscribe endpoint (RFC 8058). This is the target of the
 * `List-Unsubscribe: <…/api/newsletter/unsubscribe?token=…>` header paired with
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Mailbox providers POST
 * here (no user interaction) to unsubscribe. Reads ?token (unsubscribe_token),
 * flips status = 'unsubscribed' via the service-role client, returns 200.
 *
 * Idempotent and non-leaky: an unknown/invalid token still returns 200 (we never
 * reveal whether an address is on the list). RLS-deny table → service role only.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();

  if (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
    UUID_RE.test(token)
  ) {
    try {
      await supabaseServer
        .from("newsletter_subscriptions")
        .update({ status: "unsubscribed" })
        .eq("unsubscribe_token", token);
    } catch (e) {
      console.error("newsletter one-click unsubscribe error", e);
      // Still return ok — one-click must not surface errors to the mail client.
    }
  }

  return NextResponse.json({ ok: true });
}

// RFC 8058 one-click uses POST. Also accept GET so the same URL works if opened
// in a browser directly.
export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
