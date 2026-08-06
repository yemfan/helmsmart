/**
 * GET /api/auth/threads/callback
 * Threads redirects here after consent. Verifies the CSRF nonce, exchanges the
 * code for a token + user id, and stores the (encrypted) token against the
 * logged-in user's active org. Mirrors the LinkedIn callback.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { THREADS_SCOPES } from "@helm/dna-marketing";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  getThreadsConfig,
  exchangeThreadsCode,
  fetchThreadsProfile,
  encryptThreadsToken,
} from "@/lib/threads";

/**
 * Strip credential-like tokens from an error string before it ever reaches a
 * URL. Meta echoes the rejected secret in "Invalid client_secret: <value>", and
 * a secret must never sit in a redirect (it can be logged, cached, or shared).
 * Keeps the human-readable label, drops the value.
 */
function redactSecrets(msg: string): string {
  return msg
    .replace(/(client_secret[:=]?\s*)\S+/gi, "$1[redacted]")
    .replace(/\b[A-Fa-f0-9]{16,}\b/g, "[redacted]");
}

export async function GET(req: Request) {
  const { baseUrl } = getThreadsConfig();
  const back = (q: string) => NextResponse.redirect(`${baseUrl}/social?${q}`);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) return back(`threads_error=${encodeURIComponent(oauthError)}`);

    const cookieStore = await cookies();
    const orgId = cookieStore.get("helmsmart-org-id")?.value;
    const stateCookie = cookieStore.get("threads_oauth_state")?.value;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!code || !orgId || !user) return back("threads_error=missing_context");
    if (!state || !stateCookie || state !== stateCookie) return back("threads_error=bad_state");

    const token = await exchangeThreadsCode(code);
    if (!token.ok) {
      // Full detail (incl. any secret Meta echoes) is logged server-side only.
      console.error("[threads] token exchange failed:", token.error);
      // The URL detail must never carry a credential: Meta echoes the offending
      // value in "Invalid client_secret: <value>", so redact secret-like tokens
      // before surfacing a SHORT, diagnosable hint (e.g. "Invalid client_secret:
      // [redacted]" / "redirect_uri mismatch").
      const detail = redactSecrets(token.error).slice(0, 120);
      // TEMP diagnostic: on "Invalid client_secret", report what the RUNNING
      // server actually uses — the (public) app id + the secret's LENGTH (never
      // the value). Tells "wrong app id" / "secret unset or wrong Vercel env"
      // (slen 0 / not 32) apart from a genuine id↔secret mismatch (right length,
      // still rejected). Remove once Threads connects.
      const cfg = getThreadsConfig();
      const dbg = `id=${cfg.clientId ?? "unset"},slen=${cfg.clientSecret?.length ?? 0}`;
      return back(
        `threads_error=token_exchange_failed&threads_detail=${encodeURIComponent(detail)}&threads_debug=${encodeURIComponent(dbg)}`,
      );
    }

    // /me is canonical for the id + handle; fall back to the id from the token
    // response if the profile lookup hiccups.
    const profile = await fetchThreadsProfile(token.accessToken);
    const userId = profile?.userId ?? token.userId;
    const expiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();

    const db = await createServiceClient();
    const { error: dbErr } = await db.from("org_oauth_tokens").upsert(
      {
        organization_id: orgId,
        provider: "threads",
        access_token: encryptThreadsToken(token.accessToken),
        token_type: "Bearer",
        expires_at: expiresAt,
        scope: THREADS_SCOPES.join(","),
        // account_email carries the Threads user id (the {user-id} the publish
        // endpoints need); the @handle lives in metadata.
        account_email: userId,
        metadata: { username: profile?.username ?? null },
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,provider" },
    );
    if (dbErr) {
      console.error("[threads] token upsert error:", dbErr);
      return back("threads_error=save_failed");
    }

    const res = back("threads=connected");
    res.cookies.delete("threads_oauth_state");
    return res;
  } catch (e) {
    console.error("[threads] callback error:", e);
    return back("threads_error=server_error");
  }
}
