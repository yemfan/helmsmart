import "server-only";

/**
 * Cloudflare Turnstile on the hub's public endpoints.
 *
 * Opt-in by configuration: with `TURNSTILE_SECRET_KEY` (server) and
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (page) set, the lead, chat and booking
 * endpoints require a token the page obtained invisibly; without them,
 * nothing changes and the daily quotas remain the only guard. That keeps a
 * missing key from turning every hub form into a wall.
 *
 * Verification is one POST to Cloudflare. A verification OUTAGE is treated
 * as a pass and logged — a lead lost to Cloudflare being down is worse than
 * one junk row — but a token that Cloudflare says is bad is a refusal.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim());
}

export type TurnstileResult = { ok: true } | { ok: false; reason: "missing" | "invalid" };

/**
 * @param token what the page sent (`turnstileToken` in the body)
 * @param remoteIp the caller's ip, when known — Cloudflare cross-checks it
 */
export async function verifyTurnstile(token: unknown, remoteIp: string | null): Promise<TurnstileResult> {
  if (!turnstileEnabled()) return { ok: true };
  const secret = process.env.TURNSTILE_SECRET_KEY!.trim();
  const t = typeof token === "string" ? token.trim() : "";
  if (!t) return { ok: false, reason: "missing" };
  try {
    const form = new URLSearchParams({ secret, response: t.slice(0, 2048) });
    if (remoteIp) form.set("remoteip", remoteIp);
    const res = await fetch(VERIFY_URL, { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; "error-codes"?: string[] };
    if (!res.ok) {
      console.warn("[turnstile] verify HTTP", res.status);
      return { ok: true };
    }
    if (body.success === true) return { ok: true };
    // Cloudflare answered and said no.
    return { ok: false, reason: "invalid" };
  } catch (e) {
    console.warn("[turnstile] verify failed:", e instanceof Error ? e.message : e);
    return { ok: true };
  }
}
