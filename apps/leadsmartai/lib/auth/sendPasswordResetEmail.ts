
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
 * Ask the server to send a password-reset link.
 *
 * Delivery is ours, not Supabase's — see app/api/auth/password-reset.
 */
export async function sendPasswordResetEmail(
  email: string
): Promise<{ ok: true } | { ok: false; reason: PasswordResetFailure }> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, reason: "email_required" };
  }

  // Posted to our own endpoint rather than calling Supabase from the browser.
  // Supabase's built-in email service is rate-limited, unbranded and often
  // filtered, and it reported a clean success the whole time it was not
  // arriving. The server mints the same recovery link and sends it through the
  // verified domain the rest of the product sends from.
  try {
    const res = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    });
    // The endpoint answers 200 whether or not an account exists — it must not
    // become an account-enumeration oracle — so only a transport or server
    // failure gets here.
    if (!res.ok) {
      console.error(`[sendPasswordResetEmail] reset endpoint returned ${res.status}`);
      return { ok: false, reason: "send_failed" };
    }
    return { ok: true };
  } catch (e) {
    console.error("[sendPasswordResetEmail] could not reach the reset endpoint:", e);
    return { ok: false, reason: "send_failed" };
  }
}
