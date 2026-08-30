import "server-only";

import { PINTEREST_API_BASE, isPinterestSandbox, pinUrl } from "@/lib/pinterest/graph";
import { refreshAccessToken } from "./pinterest-oauth";
import { decryptToken, encryptToken } from "./token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Pinterest publishing — the EFFECTS only. A Pin is a single POST /v5/pins:
 * it needs a destination board, an image (via image_url — Pinterest fetches
 * it), and optionally a title, description, and outbound link.
 *
 * Adapts failures into a tagged Error `publish.ts` reads (`pinterestStatus`)
 * to classify retryable vs permanent.
 */

export type PublishResult = {
  externalPostId: string;
  externalPostUrl: string | null;
};

function tagError(
  message: string,
  status?: number | null,
  opts?: { missingScopes?: string[]; code?: number | null },
): Error {
  const err = new Error(message);
  Object.assign(err, {
    pinterestStatus: status ?? null,
    pinterestMissingScopes: opts?.missingScopes ?? null,
    pinterestCode: opts?.code ?? null,
  });
  return err;
}

/**
 * Pinterest's application-level error code for an app that hasn't been granted
 * Standard access:
 *
 *   403 code 29: Apps with Trial access may not create Pins in production
 *   https://api.pinterest.com - use API Sandbox https://api-sandbox.pinterest.com
 *
 * Worth naming as its own case. Verbatim, it tells a real-estate agent to go
 * use an API sandbox, which is advice for us, not them — and unlike the
 * missing-scope error there is nothing they can do about it: reconnecting is
 * useless, because the block is on the app, not on their account.
 */
export const PINTEREST_TRIAL_ACCESS_CODE = 29;

/** Message shown to the agent when Pinterest hasn't approved the app to publish. */
export const PINTEREST_TRIAL_ACCESS_MESSAGE =
  "Pinterest hasn't approved CloseBoss for publishing yet, so Pins can't be sent. " +
  "Nothing is wrong with your Pinterest account — this is on our side and doesn't " +
  "need a reconnect.";

/**
 * Turn a raw Pinterest failure into what the agent should read. Returns null
 * when we have nothing better to say than the platform's own words.
 */
export function agentFacingPinterestError(
  code: number | null | undefined,
  message: string,
): string | null {
  if (code === PINTEREST_TRIAL_ACCESS_CODE) return PINTEREST_TRIAL_ACCESS_MESSAGE;
  // Belt and braces: Pinterest has changed numeric codes before, and the
  // sandbox sentence is unmistakable even if code 29 is ever renumbered.
  if (/Trial access/i.test(message) && /sandbox/i.test(message)) {
    return PINTEREST_TRIAL_ACCESS_MESSAGE;
  }
  return null;
}

/**
 * Pinterest's 403 for an under-scoped token, e.g.
 *   "… Please ensure your token is authorized with the correct set of
 *    scopes. Missing: ['boards:write']"
 * Pulling the names out turns an opaque platform string into an instruction the
 * agent can act on ("reconnect Pinterest"), and lets publish.ts flag the
 * connection instead of burning three retries on an error retrying cannot fix.
 */
export function parseMissingScopes(message: string): string[] {
  const m = /Missing:\s*\[([^\]]*)\]/i.exec(message);
  if (!m?.[1]) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

type PinterestConn = {
  id: string;
  user_access_token_enc: string | null;
  pinterest_refresh_token_enc: string | null;
  user_token_expires_at: string | null;
};

/**
 * A currently-valid Pinterest access token, refreshing within 2 min of expiry.
 * Pinterest access tokens live ~30 days; without this a connection simply stops
 * publishing a month after it was made, with no signal beyond failed Pins.
 * Mirrors `ensureTikTokAccessToken`.
 */
export async function ensurePinterestAccessToken(conn: PinterestConn): Promise<string> {
  const current = conn.user_access_token_enc ? decryptToken(conn.user_access_token_enc) : "";
  const expMs = conn.user_token_expires_at ? Date.parse(conn.user_token_expires_at) : 0;
  if (current && expMs && expMs - Date.now() > 120_000) return current;
  if (!conn.pinterest_refresh_token_enc) {
    if (current) return current;
    throw tagError("Pinterest token expired — reconnect Pinterest.", 401);
  }

  const t = await refreshAccessToken(decryptToken(conn.pinterest_refresh_token_enc));
  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("social_accounts")
    .update({
      user_access_token_enc: encryptToken(t.accessToken),
      pinterest_refresh_token_enc: t.refreshToken
        ? encryptToken(t.refreshToken)
        : conn.pinterest_refresh_token_enc,
      user_token_expires_at: new Date(Date.now() + t.expiresIn * 1000).toISOString(),
      // Record what the refreshed grant actually carries, not what we asked for.
      ...(t.grantedScopes ? { scopes: t.grantedScopes } : {}),
      last_refreshed_at: nowIso,
      updated_at: nowIso,
    } as never)
    .eq("id", conn.id);
  return t.accessToken;
}

type CreatePinResponse = {
  id?: string;
  message?: string;
  code?: number;
};

/** Publish a Pin. `imageUrl` and `boardId` are required by Pinterest. */
export async function publishPinterestPin(params: {
  accessToken: string;
  boardId: string;
  title: string;
  description: string;
  link: string | null;
  imageUrl: string;
}): Promise<PublishResult> {
  const { accessToken, boardId, title, description, link, imageUrl } = params;

  const body: Record<string, unknown> = {
    board_id: boardId,
    // Pinterest caps: title 100 chars, description 800 chars. Trim defensively.
    title: title.slice(0, 100),
    description: description.slice(0, 800),
    media_source: { source_type: "image_url", url: imageUrl },
  };
  if (link) body.link = link;

  const res = await fetch(`${PINTEREST_API_BASE}/pins`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as CreatePinResponse;
  if (!res.ok || !json.id) {
    const msg = json.message || `HTTP ${res.status}`;
    const missingScopes = parseMissingScopes(msg);
    const friendly = agentFacingPinterestError(json.code, msg);
    throw tagError(friendly ?? `Pinterest publish failed: ${msg}`, res.status, {
      missingScopes,
      code: json.code ?? null,
    });
  }

  // A sandbox Pin has a real id but no page on pinterest.com. Handing back a
  // pinUrl() for one would put a dead link in the agent's public feed, so the
  // URL is omitted rather than fabricated.
  return {
    externalPostId: json.id,
    externalPostUrl: isPinterestSandbox() ? null : pinUrl(json.id),
  };
}
