import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getOAuthRedirectOrigin } from "@/lib/siteUrl";

/**
 * Why the reset could not be sent, as a code rather than a sentence.
 *
 * The sentence used to come from here, which put English on a Chinese screen —
 * `Enter your email address first.` under a form whose every other label was
 * translated. Callers own the copy now, so each one renders it in the reader's
 * language from its own namespace.
 */
export type PasswordResetFailure = "email_required" | "send_failed";

/**
 * Supabase's own error text is a configuration diagnostic — a redirect URL that
 * is not on the allow-list, SMTP that is not set up. That is for whoever
 * deployed the app, not for the person who just wants a reset link, so it goes
 * to the console with the fix attached and never to the screen.
 */
function logResetPasswordError(raw: string): void {
  const msg = raw.trim() || "Could not send reset email.";
  if (/redirect|url|not allowed|invalid.*redirect/i.test(msg)) {
    console.error(
      `[sendPasswordResetEmail] ${msg} In Supabase → Authentication → URL Configuration, add Redirect URL ` +
        "`https://your-domain/reset-password` (and `http://localhost:3000/reset-password` for dev). " +
        "Set `NEXT_PUBLIC_SITE_URL` to your public `https://…` origin so the link matches production."
    );
    return;
  }
  if (/recovery|sending|email|smtp|mail/i.test(msg)) {
    console.error(
      `[sendPasswordResetEmail] ${msg} Check Supabase → Project Settings → Authentication: email templates enabled, ` +
        "custom SMTP if you use it, and project email rate limits. Confirm the user exists and signed up with email/password."
    );
    return;
  }
  console.error(`[sendPasswordResetEmail] ${msg}`);
}

/**
 * Sends Supabase recovery email. Add `…/reset-password` under Supabase → Authentication →
 * URL Configuration → Redirect URLs (same path as Property Tools; same origin as {@link getOAuthRedirectOrigin}).
 */
export async function sendPasswordResetEmail(
  email: string
): Promise<{ ok: true } | { ok: false; reason: PasswordResetFailure }> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, reason: "email_required" };
  }

  const origin = getOAuthRedirectOrigin();
  const supabase = supabaseBrowser();
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: `${origin}/reset-password`,
  });

  if (error) {
    logResetPasswordError(error.message);
    return { ok: false, reason: "send_failed" };
  }
  return { ok: true };
}
