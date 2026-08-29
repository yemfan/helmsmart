import "server-only";

import { PINTEREST_API_BASE, pinUrl } from "@/lib/pinterest/graph";
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
  opts?: { missingScopes?: string[] },
): Error {
  const err = new Error(message);
  Object.assign(err, {
    pinterestStatus: status ?? null,
    pinterestMissingScopes: opts?.missingScopes ?? null,
  });
  return err;
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
    throw tagError(`Pinterest publish failed: ${msg}`, res.status, { missingScopes });
  }

  return { externalPostId: json.id, externalPostUrl: pinUrl(json.id) };
}
