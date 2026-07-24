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
    if (!token) return back("threads_error=token_exchange_failed");

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
