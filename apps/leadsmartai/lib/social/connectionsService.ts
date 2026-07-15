import "server-only";

import { encryptToken } from "@/lib/leads-gen/token-enc";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabaseServer";

import type { FacebookPage } from "./facebookOauth";

/**
 * Persistence for agent_social_connections.
 *
 * Reads via supabaseServer (RLS-scoped); writes that store access
 * tokens via supabaseAdmin (service role) because the RLS policy on
 * insert needs the auth context anyway, and we want strict control
 * over who can write tokens — only the OAuth callback route does.
 *
 * Tokens NEVER cross the wire to the client: list endpoints project
 * away `access_token` so the settings panel sees only metadata.
 */

export type AgentSocialConnection = {
  id: string;
  agentId: string;
  provider: "facebook_page";
  providerAccountId: string;
  providerAccountName: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const FB_PROVIDER = "facebook_page";

const FB_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"];

/**
 * Mirror connected Pages into `social_accounts` — the PUBLISHER's source of
 * truth (lib/leads-gen/publish.ts → publishPost), which backs the
 * scheduled-publish cron, Quick Post, and the brand auto-poster.
 *
 * Why this exists: connecting writes `agent_social_connections`, but every
 * publish path reads `social_accounts`. Without this mirror a Page connected
 * here is INVISIBLE to all of them and they silently no-op ("No Facebook
 * account connected") with no error to debug.
 *
 * Note the token is stored ENCRYPTED here (`page_access_token_enc`), unlike
 * `agent_social_connections.access_token` which is still plaintext.
 *
 * Best-effort: a mirror failure must not fail the OAuth callback — the agent is
 * mid-flow and the primary row already saved.
 */
async function mirrorPagesToSocialAccounts(
  agentId: string,
  pages: ReadonlyArray<FacebookPage>,
): Promise<void> {
  const now = new Date().toISOString();
  for (const p of pages) {
    try {
      const fields = {
        agent_id: agentId,
        platform: "meta",
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
        .eq("agent_id", agentId)
        .eq("platform", "meta")
        .eq("fb_page_id", p.id)
        .maybeSingle();

      if (existing) {
        await supabaseAdmin
          .from("social_accounts")
          .update(fields as never)
          .eq("id", (existing as { id: string }).id);
      } else {
        await supabaseAdmin
          .from("social_accounts")
          .insert({ ...fields, connected_at: now } as never);
      }
    } catch (e) {
      console.error("[connectionsService] social_accounts mirror failed", p.id, e);
    }
  }
}

/**
 * Upsert one row per (agent, provider, providerAccountId). When the
 * agent re-runs the OAuth flow on the same page, the access token is
 * refreshed in place — no duplicate row, revoked_at cleared.
 */
export async function upsertFacebookPagesForAgent(args: {
  agentId: string;
  pages: ReadonlyArray<FacebookPage>;
}): Promise<{ inserted: number; updated: number }> {
  if (args.pages.length === 0) return { inserted: 0, updated: 0 };

  // Determine which pages already exist so we can return inserted/
  // updated counts (callers surface "Connected 2 new pages" copy).
  const { data: existingRows } = await supabaseAdmin
    .from("agent_social_connections")
    .select("provider_account_id")
    .eq("agent_id", args.agentId)
    .eq("provider", FB_PROVIDER)
    .in(
      "provider_account_id",
      args.pages.map((p) => p.id) as unknown as never[],
    );
  const existingIds = new Set(
    ((existingRows ?? []) as Array<{ provider_account_id: string }>).map(
      (r) => r.provider_account_id,
    ),
  );

  const now = new Date().toISOString();
  const rows = args.pages.map((p) => ({
    agent_id: args.agentId,
    provider: FB_PROVIDER,
    provider_account_id: p.id,
    provider_account_name: p.name,
    access_token: p.accessToken,
    // Long-lived page tokens are nominally 60 days; we mark + 55d to
    // leave headroom for the cron-side refresh that will land in a
    // follow-up.
    token_expires_at: new Date(Date.now() + 55 * 86_400_000).toISOString(),
    scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    connected_at: now,
    revoked_at: null,
  }));

  const { error } = await supabaseAdmin
    .from("agent_social_connections")
    .upsert(rows, { onConflict: "agent_id,provider,provider_account_id" });
  if (error) throw new Error(error.message);

  // Keep the publisher's source of truth in sync, or nothing can actually post.
  await mirrorPagesToSocialAccounts(args.agentId, args.pages);

  let inserted = 0;
  let updated = 0;
  for (const p of args.pages) {
    if (existingIds.has(p.id)) updated += 1;
    else inserted += 1;
  }
  return { inserted, updated };
}

/**
 * List connections for an agent — without access tokens. Drives the
 * settings panel and the post-time picker.
 */
export async function listConnectionsForAgent(
  agentId: string,
  opts: { includeRevoked?: boolean } = {},
): Promise<AgentSocialConnection[]> {
  let q = supabaseServer
    .from("agent_social_connections")
    .select(
      "id, agent_id, provider, provider_account_id, provider_account_name, scopes, token_expires_at, connected_at, last_used_at, revoked_at",
    )
    .eq("agent_id", agentId)
    .order("connected_at", { ascending: false });
  if (!opts.includeRevoked) q = q.is("revoked_at", null);

  const { data, error } = await q;
  if (error) {
    console.warn("[social.connections] list failed:", error.message);
    return [];
  }
  return ((data ?? []) as Array<{
    id: string;
    agent_id: string | number;
    provider: string;
    provider_account_id: string;
    provider_account_name: string | null;
    scopes: string[] | null;
    token_expires_at: string | null;
    connected_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
  }>).map((r) => ({
    id: r.id,
    agentId: String(r.agent_id),
    provider: r.provider as "facebook_page",
    providerAccountId: r.provider_account_id,
    providerAccountName: r.provider_account_name,
    scopes: Array.isArray(r.scopes) ? r.scopes : [],
    tokenExpiresAt: r.token_expires_at,
    connectedAt: r.connected_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  }));
}

/**
 * Look up one connection's access token for a server-side post.
 * Service-role read so we can fetch the token even though it's never
 * exposed via the list endpoint.
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
    .from("agent_social_connections")
    .select("id, provider_account_id, provider_account_name, access_token, revoked_at")
    .eq("id", args.connectionId)
    .eq("agent_id", args.agentId)
    .eq("provider", FB_PROVIDER)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    id: string;
    provider_account_id: string;
    provider_account_name: string | null;
    access_token: string;
    revoked_at: string | null;
  };
  if (row.revoked_at) return null;
  return {
    id: row.id,
    providerAccountId: row.provider_account_id,
    providerAccountName: row.provider_account_name,
    accessToken: row.access_token,
  };
}

/**
 * Soft-revoke — mark `revoked_at` so the audit trail (social_post_log
 * connection_id FK) still resolves. The list endpoint hides revoked
 * connections by default.
 */
export async function revokeConnection(args: {
  agentId: string;
  connectionId: string;
}): Promise<boolean> {
  const { error } = await supabaseServer
    .from("agent_social_connections")
    .update({ revoked_at: new Date().toISOString() })
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
    .from("agent_social_connections")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", connectionId);
}
