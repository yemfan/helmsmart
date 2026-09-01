import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * Opt a contact out of agent outreach email.
 *
 * Two callers, one behaviour:
 *   - Mail providers POST here with no user interaction. This is the target of
 *     `List-Unsubscribe: <…/api/email/unsubscribe?token=…>` paired with
 *     `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), which is
 *     what puts Gmail's and Outlook's native Unsubscribe button on the message.
 *   - A person clicks the footer link, which lands here as a GET and is
 *     redirected to a page that tells them it worked.
 *
 * ALWAYS 200, EVEN FOR A BAD TOKEN. Two reasons and both matter: a one-click
 * unsubscribe that returns an error gets reported to the provider as a broken
 * unsubscribe, which is worse for the sending domain than the mail itself; and
 * a 404 for an unknown token would confirm which tokens are real, turning this
 * into an oracle for whether an address is in the CRM.
 *
 * It writes `contact_opt_out_email` — the CONTACT asked to stop — and never
 * `do_not_contact_email`, which is the agent's own flag and not ours to set.
 *
 * Idempotent: unsubscribing twice is the same as once.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function optOut(token: string): Promise<void> {
  if (!UUID_RE.test(token)) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;

  try {
    // Service-role: `contacts` is agent-scoped by RLS and the person clicking
    // this link is not signed in as anyone. The token IS the authorisation, and
    // it scopes the write to exactly one row.
    await supabaseServer
      .from("contacts")
      .update({ contact_opt_out_email: true })
      .eq("email_unsubscribe_token", token);
  } catch (e) {
    // Never surfaced. A one-click unsubscribe that reports an error is recorded
    // by the provider as a failed unsubscribe.
    console.error("[email-unsubscribe] failed to record opt-out:", e);
  }
}

function tokenFrom(req: Request): string {
  return (new URL(req.url).searchParams.get("token") ?? "").trim();
}

/** RFC 8058 one-click. No body is read: the token is in the URL. */
export async function POST(req: Request) {
  await optOut(tokenFrom(req));
  return NextResponse.json({ ok: true });
}

/**
 * The footer link. Same effect, then a page a person can read — landing on raw
 * JSON after asking to be left alone reads as "it did not work", and the next
 * click is the spam button.
 */
export async function GET(req: Request) {
  await optOut(tokenFrom(req));
  return NextResponse.redirect(new URL("/email/unsubscribed", req.url), 303);
}
