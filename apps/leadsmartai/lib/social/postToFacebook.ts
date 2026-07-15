import "server-only";

import { META_GRAPH_BASE } from "@/lib/meta/graph";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  getConnectionWithTokenForPost,
  touchLastUsedAt,
} from "./connectionsService";

/**
 * Server orchestrator for posting a single message to a connected
 * Facebook Page wall.
 *
 * v1 posts text + an optional link only — no image upload (image
 * upload requires either a public URL or multipart upload, both
 * of which need plumbing we'll add in a follow-up). The link
 * preview Facebook renders from the URL gives the post visual
 * weight even without a direct image attachment.
 *
 * Every attempt — success or failure — gets logged to
 * social_post_log so the audit panel can show the agent what
 * went out and what didn't.
 */

// Shared Graph version (lib/meta/graph.ts). Was pinned to v19.0 — released
// Jan 2024, already past Meta's ~2-year deprecation window.
const GRAPH_BASE = META_GRAPH_BASE;

export type PostToFacebookInput = {
  agentId: string;
  connectionId: string;
  caption: string;
  /** Optional outbound link (e.g. listing URL on a marketing site).
   *  Facebook auto-renders a card preview from the link's OpenGraph. */
  link?: string | null;
  /** Optional transaction id for audit trail — links the post back
   *  to the deal on the social_post_log table. */
  transactionId?: string | null;
};

export type PostToFacebookResult =
  | { ok: true; postId: string; logId: string }
  | { ok: false; error: string; logId: string };

export async function postListingToFacebook(
  input: PostToFacebookInput,
): Promise<PostToFacebookResult> {
  // Reserve the audit row up-front so a crash mid-send still leaves
  // a 'pending' marker the agent can see + investigate.
  const logId = await insertPendingLog(input);

  const conn = await getConnectionWithTokenForPost({
    agentId: input.agentId,
    connectionId: input.connectionId,
  });
  if (!conn) {
    await markLogFailed(logId, "Connection not found or revoked.");
    return {
      ok: false,
      error: "Connection not found or revoked.",
      logId,
    };
  }

  const url = `${GRAPH_BASE}/${encodeURIComponent(conn.providerAccountId)}/feed`;
  const params = new URLSearchParams({
    message: input.caption,
    access_token: conn.accessToken,
  });
  if (input.link?.trim()) {
    params.set("link", input.link.trim());
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      body: params,
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error contacting Facebook.";
    await markLogFailed(logId, msg);
    return { ok: false, error: msg, logId };
  }

  if (!res.ok) {
    let errMsg = `Facebook returned ${res.status}`;
    try {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string; code?: number };
      } | null;
      if (body?.error?.message) errMsg = body.error.message;
    } catch {
      // Already have the status fallback.
    }
    await markLogFailed(logId, errMsg);
    return { ok: false, error: errMsg, logId };
  }

  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  const postId = json?.id;
  if (!postId) {
    const errMsg = "Facebook returned no post id.";
    await markLogFailed(logId, errMsg);
    return { ok: false, error: errMsg, logId };
  }

  await markLogSent(logId, postId, conn.id);
  await touchLastUsedAt(conn.id);

  return { ok: true, postId, logId };
}

async function insertPendingLog(input: PostToFacebookInput): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("social_post_log")
    .insert({
      agent_id: input.agentId,
      provider: "facebook_page",
      transaction_id: input.transactionId ?? null,
      caption: input.caption,
      status: "pending",
    } as never)
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to write social_post_log row.");
  }
  return (data as { id: string }).id;
}

async function markLogSent(
  logId: string,
  providerPostId: string,
  connectionId: string,
): Promise<void> {
  await supabaseAdmin
    .from("social_post_log")
    .update({
      status: "sent",
      provider_post_id: providerPostId,
      connection_id: connectionId,
    } as never)
    .eq("id", logId);
}

async function markLogFailed(logId: string, errorMsg: string): Promise<void> {
  await supabaseAdmin
    .from("social_post_log")
    .update({
      status: "failed",
      error: errorMsg.slice(0, 1000),
    } as never)
    .eq("id", logId);
}

/**
 * Predicate for callers that need to narrow under the project's
 * `tsconfig.strict:false` (no auto-narrowing on discriminated unions).
 */
export function isFacebookPostFailure(
  r: PostToFacebookResult,
): r is { ok: false; error: string; logId: string } {
  return r.ok === false;
}
