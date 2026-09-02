import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * Opt a contact out of PropertyTools AI marketing email.
 *
 * Deliberately mirrors CloseBoss's route, because they write the SAME
 * `contacts` row: an unsubscribe means "stop emailing me", not "stop from this
 * app", and both apps read `contact_opt_out_email` before sending. Two
 * endpoints on two domains, one flag.
 *
 * Two callers, one behaviour:
 *   - Mail providers POST here with no user interaction — the target of
 *     `List-Unsubscribe` paired with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 *     (RFC 8058), which is what puts the native Unsubscribe button on the message.
 *   - A person clicks the footer link, which arrives as a GET and is redirected
 *     to a page telling them it worked.
 *
 * ALWAYS 200, EVEN FOR A BAD TOKEN. A one-click unsubscribe that returns an
 * error is recorded by the provider as a BROKEN unsubscribe, which harms the
 * sending domain more than the mail did; and a 404 for an unknown token would
 * confirm which tokens are real, turning this into an oracle for whether an
 * address is in the CRM.
 *
 * Writes `contact_opt_out_email` — the CONTACT asked to stop — and never
 * `do_not_contact_email`, which is the agent's own flag and not ours to set.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function optOut(token: string): Promise<void> {
  if (!UUID_RE.test(token)) return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;

  try {
    // Service-role: the person clicking this link is not signed in as anyone.
    // The token IS the authorisation, and it scopes the write to one row.
    await supabaseServer
      .from("contacts")
      .update({ contact_opt_out_email: true } as never)
      .eq("email_unsubscribe_token", token);
  } catch (e) {
    // Never surfaced — see above.
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
