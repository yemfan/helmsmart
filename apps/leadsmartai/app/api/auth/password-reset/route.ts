import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail, EMAIL_BRAND } from "@/lib/email";
import { requireSupabasePublicEnv } from "@/lib/supabasePublicEnv";

export const runtime = "nodejs";

/**
 * Password reset, sent by us rather than by Supabase.
 *
 * The reset used to call `supabase.auth.resetPasswordForEmail` from the
 * browser, which hands delivery to Supabase's own email service. That service
 * is meant for development: it is rate-limited to a couple of messages an hour,
 * sends from an address with no relationship to this product, and lands in spam
 * often enough that "check your email" became a lie. Supabase logged the
 * request as a clean 200 the whole time — nothing in our code or its logs said
 * the mail never arrived.
 *
 * So we mint the recovery link with the admin API and send it through Resend,
 * from the same verified domain as every other message this product sends.
 * Delivery is then something we can see, brand, and be held to.
 *
 * Two properties this endpoint must keep:
 *
 *  - It NEVER says whether an address has an account. Same response, same
 *    timing-insensitive shape, whatever happened. A reset form that answers
 *    "no such user" is an account-enumeration oracle.
 *  - It never returns a configuration error to the browser. A missing key or an
 *    unlisted redirect URL is for whoever deployed this, and goes to the server
 *    log with the fix attached.
 */

type Body = { email?: unknown };

/** Where the recovery link should land. Must be allow-listed in Supabase. */
function resetRedirectTo(req: Request): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (envOrigin) return `${envOrigin}/reset-password`;
  // Fall back to the origin the request came from, so a preview deployment
  // sends links back to itself instead of to production.
  return `${new URL(req.url).origin}/reset-password`;
}

function resetEmailBody(link: string): { text: string; html: string } {
  const text = [
    `Reset your ${EMAIL_BRAND} password`,
    "",
    "Use this link to choose a new password:",
    link,
    "",
    "The link can only be used once, and expires shortly.",
    "If you did not ask to reset your password, you can ignore this email — nothing has changed.",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:520px">
      <h1 style="font-size:18px;margin:0 0 12px">Reset your ${EMAIL_BRAND} password</h1>
      <p style="margin:0 0 20px">Use the button below to choose a new password.</p>
      <p style="margin:0 0 24px">
        <a href="${link}" style="display:inline-block;background:#0072ce;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">Choose a new password</a>
      </p>
      <p style="margin:0 0 8px;color:#475569;font-size:13px">Or paste this into your browser:</p>
      <p style="margin:0 0 24px;word-break:break-all;font-size:12px;color:#475569">${link}</p>
      <p style="margin:0;color:#475569;font-size:13px">
        The link can only be used once, and expires shortly. If you did not ask to reset your
        password, you can ignore this email — nothing has changed.
      </p>
    </div>`.trim();

  return { text, html };
}

/**
 * Last resort when Resend is not configured: let Supabase send it after all.
 * Worse deliverability, but an email that might arrive beats none.
 */
async function fallbackToSupabaseSend(email: string, redirectTo: string): Promise<void> {
  try {
    const { url, anonKey } = requireSupabasePublicEnv();
    const res = await fetch(`${url}/auth/v1/recover`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, gotrue_meta_security: {} , redirect_to: redirectTo }),
    });
    if (!res.ok) {
      console.error(
        `[password-reset] Supabase fallback send failed (${res.status}). Set RESEND_API_KEY so resets go out on the verified domain.`,
      );
    }
  } catch (e) {
    console.error("[password-reset] Supabase fallback send threw:", e);
  }
}

export async function POST(req: Request) {
  // Parsed defensively: a malformed body is answered exactly like a good one,
  // so probing the endpoint tells an attacker nothing.
  const body = (await req.json().catch(() => ({}))) as Body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const ok = NextResponse.json({ ok: true });

  if (!email || !email.includes("@")) return ok;

  const redirectTo = resetRedirectTo(req);

  try {
    if (!process.env.RESEND_API_KEY?.trim()) {
      console.warn(
        "[password-reset] RESEND_API_KEY is not set — falling back to Supabase's own email service, " +
          "which is rate-limited and frequently lands in spam.",
      );
      await fallbackToSupabaseSend(email, redirectTo);
      return ok;
    }

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    // No account for this address is the normal, expected case for a public
    // form. Log nothing alarming and answer exactly as if it had worked.
    if (error) {
      const msg = error.message ?? "";
      if (/not found|no user|user_not_found/i.test(msg)) return ok;
      console.error(
        `[password-reset] generateLink failed: ${msg} — check that ${redirectTo} is listed under ` +
          "Supabase → Authentication → URL Configuration → Redirect URLs.",
      );
      return ok;
    }

    const link = data?.properties?.action_link;
    if (!link) {
      console.error("[password-reset] generateLink returned no action_link.");
      return ok;
    }

    // Supabase does NOT reject a redirect that is not allow-listed — it
    // silently swaps in the project Site URL, and drops the path while it is
    // at it. The result is a working email whose link lands on a homepage,
    // which looks like the reset being broken rather than a missing entry in
    // a dashboard. Name it here instead of letting people guess.
    const landed = new URL(link).searchParams.get("redirect_to");
    if (landed && landed !== redirectTo) {
      console.error(
        `[password-reset] Supabase rewrote the redirect: asked for ${redirectTo}, got ${landed}. ` +
          `Add ${redirectTo} under Supabase → Authentication → URL Configuration → Redirect URLs. ` +
          "Until then the link will not land on the reset page.",
      );
    }

    const { text, html } = resetEmailBody(link);
    const sent = await sendEmail({
      to: email,
      subject: `Reset your ${EMAIL_BRAND} password`,
      text,
      html,
    });
    if (!sent) {
      console.error("[password-reset] sendEmail returned nothing — the reset link was not delivered.");
    }
    return ok;
  } catch (e) {
    // Still a success to the caller: whether the address exists is not
    // something a failure on our side should leak.
    console.error("[password-reset] unexpected failure:", e);
    return ok;
  }
}
