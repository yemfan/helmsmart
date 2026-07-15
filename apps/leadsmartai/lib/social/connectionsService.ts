import "server-only";

import { decryptToken, encryptToken } from "@/lib/leads-gen/token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabaseServer";

import type { FacebookPage } from "./facebookOauth";

/**
 * Persistence for social connections — backed by `social_accounts`.
 *
 * CONSOLIDATION (2026-07-15): this used to own a second table,
 * `agent_social_connections`, while every publisher (`lib/leads-gen/publish.ts`
 * → the scheduled-publish cron, Quick Post, the brand poster) read
 * `social_accounts`. Two sources of truth meant a Page could connect
 * successfully and be INVISIBLE to everything that posts — a silent no-op with
 * no error. `social_accounts` is now the single store.
 *
 * It also fixes a security issue for free: `agent_social_connections.access_token`
 * was PLAINTEXT, whereas `social_accounts.page_access_token_enc` is encrypted
 * (lib/leads-gen/token-enc). Nothing writes a plaintext token anymore.
 *
 * This module's exported API is deliberately unchanged so callers (the
 * connections list/revoke routes, the settings panel, the OAuth callback, the
 * transaction post-to-facebook path) keep working against the new store.
 *
 * Tokens NEVER cross the wire to the client: the list projection omits them.
 */

export type AgentSocialConnection = {
  id: string;
  agentId: string;
  provider: "facebook_page";
  providerAccountId: string;
  providerAccountName: string | null;
  scopes: string[];
  /** Always null now. Long-lived Page tokens (from a long-lived user token)
   *  don't expire, and nothing renders this. Kept for API compatibility. */
  tokenExpiresAt: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const FB_PROVIDER = "facebook_page";
/** A Facebook/Instagram connection is stored as platform "meta" — one Meta
 *  grant covers both surfaces. See lib/leads-gen/publish.ts. */
const META_PLATFORM = "meta";
const FB_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"];

type SocialAccountRow = {
  id: string;
  agent_id: string | number;
  fb_page_id: string | null;
  fb_page_name: string | null;
  scopes: string[] | null;
  status: string;
  connected_at: string;
  last_used_at: string | null;
  updated_at: string | null;
};

function toConnection(r: SocialAccountRow): AgentSocialConnection {
  return {
    id: r.id,
    agentId: String(r.agent_id),
    provider: FB_PROVIDER,
    providerAccountId: r.fb_page_id ?? "",
    providerAccountName: r.fb_page_name,
    scopes: Array.isArray(r.scopes) ? r.scopes : [],
    tokenExpiresAt: null,
    connectedAt: r.connected_at,
    lastUsedAt: r.last_used_at,
    // social_accounts models revocation via `status` (the enum already allows
    // 'revoked'), so surface updated_at as the revocation timestamp.
    revokedAt: r.status === "revoked" ? r.updated_at : null,
  };
}

/**
 * Upsert one row per (agent, Meta page). Re-running OAuth on the same page
 * refreshes the token in place — no duplicate row, and a previously revoked
 * connection is reactivated.
 */
export async function upsertFacebookPagesForAgent(args: {
  agentId: string;
  pages: ReadonlyArray<FacebookPage>;
}): Promise<{ inserted: number; updated: number }> {
  if (args.pages.length === 0) return { inserted: 0, updated: 0 };

  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;

  for (const p of args.pages) {
    const fields = {
      agent_id: args.agentId,
      platform: META_PLATFORM,
      fb_page_id: p.id,
      fb_page_name: p.name,
      account_display_name: p.name,
      page_access_token_enc: encryptToken(p.accessToken),
      scopes: FB_SCOPES,
      status: "connected",
      last_error: null,
      updated_at: now,
    };

    const { data: existing } = await supabaseAdmin
      .from("social_accounts")
      .select("id")
      .eq("agent_id", args.agentId)
      .eq("platform", META_PLATFORM)
      .eq("fb_page_id", p.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("social_accounts")
        .update(fields as never)
        .eq("id", (existing as { id: string }).id);
      if (error) throw new Error(error.message);
      updated += 1;
    } else {
      const { error } = await supabaseAdmin
        .from("social_accounts")
        .insert({ ...fields, connected_at: now } as never);
      if (error) throw new Error(error.message);
      inserted += 1;
    }
  }

  return { inserted, updated };
}

/**
 * List a agent's Facebook Page connections — without access tokens. Drives the
 * settings panel and the post-time picker.
 */
export async function listConnectionsForAgent(
  agentId: string,
  opts: { includeRevoked?: boolean } = {},
): Promise<AgentSocialConnection[]> {
  let q = supabaseServer
    .from("social_accounts")
    .select(
      "id, agent_id, fb_page_id, fb_page_name, scopes, status, connected_at, last_used_at, updated_at",
    )
    .eq("agent_id", agentId)
    .eq("platform", META_PLATFORM)
    .not("fb_page_id", "is", null)
    .order("connected_at", { ascending: false });
  if (!opts.includeRevoked) q = q.neq("status", "revoked");

  const { data, error } = await q;
  if (error) {
    console.warn("[social.connections] list failed:", error.message);
    return [];
  }
  return ((data ?? []) as SocialAccountRow[]).map(toConnection);
}

/**
 * Look up one connection's access token for a server-side post. Service-role
 * read + decrypt at the point of use; the token is never exposed via the list
 * endpoint.
 */
export async function getConnectionWithTokenForPost(args: {
  agentId: string;
  connectionId: string;
}): Promise<{
  id: string;
  providerAccountId: string;
  providerAccountName: string | null;
  accessToken: string;
} | null> {
  const { data, error } = await supabaseAdmin
    .from("social_accounts")
    .select("id, fb_page_id, fb_page_name, page_access_token_enc, status")
    .eq("id", args.connectionId)
    .eq("agent_id", args.agentId)
    .eq("platform", META_PLATFORM)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as {
    id: string;
    fb_page_id: string | null;
    fb_page_name: string | null;
    page_access_token_enc: string | null;
    status: string;
  };
  if (row.status !== "connected" || !row.fb_page_id || !row.page_access_token_enc) {
    return null;
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(row.page_access_token_enc);
  } catch (e) {
    // Usually SOCIAL_TOKEN_ENC_KEY rotated without re-encrypting rows. Mark the
    // connection so the UI says "reconnect" instead of failing opaquely.
    console.error("[social.connections] token decrypt failed:", e);
    try {
      await supabaseAdmin
        .from("social_accounts")
        .update({
          status: "error",
          last_error: "Token decryption failed",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", row.id);
    } catch {
      /* best-effort */
    }
    return null;
  }

  return {
    id: row.id,
    providerAccountId: row.fb_page_id,
    providerAccountName: row.fb_page_name,
    accessToken,
  };
}

/**
 * Soft-revoke — flip status so the audit trail (lead_posts / social_post_log
 * FKs) still resolves. The list endpoint hides revoked connections by default.
 */
export async function revokeConnection(args: {
  agentId: string;
  connectionId: string;
}): Promise<boolean> {
  const { error } = await supabaseServer
    .from("social_accounts")
    .update({ status: "revoked", updated_at: new Date().toISOString() } as never)
    .eq("id", args.connectionId)
    .eq("agent_id", args.agentId);
  if (error) {
    console.warn("[social.connections] revoke failed:", error.message);
    return false;
  }
  return true;
}

export async function touchLastUsedAt(connectionId: string): Promise<void> {
  await supabaseAdmin
    .from("social_accounts")
    .update({ last_used_at: new Date().toISOString() } as never)
    .eq("id", connectionId);
}
