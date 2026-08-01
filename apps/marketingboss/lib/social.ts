import "server-only";
import type {
  ConnectionStore,
  SocialConnection as PkgConnection,
  SocialPlatform,
} from "@helm/dna-marketing";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken } from "@/lib/youtube";

/**
 * Read/write helpers for social_connections (RLS-denied — service role only).
 * Keeps OAuth tokens off the client entirely. Also exposes a package
 * ConnectionStore so publishToAll() can publish through these connections.
 */

export type DbConnection = {
  platform: string;
  provider_account_id: string | null;
  account_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  metadata: Record<string, string> | null;
};

const COLS =
  "platform, provider_account_id, account_name, access_token, refresh_token, token_expires_at, scope, metadata";

export async function getConnection(userId: string, platform: string): Promise<DbConnection | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("social_connections")
    .select(COLS)
    .eq("user_id", userId)
    .eq("platform", platform)
    .maybeSingle();
  return (data as DbConnection) ?? null;
}

/** Non-secret status for the UI. Never returns tokens. */
export async function getConnectionStatus(
  userId: string,
  platform: string,
): Promise<{ connected: boolean; accountName: string | null }> {
  try {
    const c = await getConnection(userId, platform);
    return { connected: !!c, accountName: c?.account_name ?? null };
  } catch {
    return { connected: false, accountName: null };
  }
}

/** Status for several platforms in one round-trip. */
export async function getConnectionStatuses(
  userId: string,
  platforms: string[],
): Promise<Record<string, { connected: boolean; accountName: string | null }>> {
  const out: Record<string, { connected: boolean; accountName: string | null }> = {};
  for (const p of platforms) out[p] = { connected: false, accountName: null };
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("social_connections")
      .select("platform, account_name")
      .eq("user_id", userId);
    for (const row of (data as { platform: string; account_name: string | null }[]) ?? []) {
      if (out[row.platform]) out[row.platform] = { connected: true, accountName: row.account_name };
    }
  } catch {
    /* leave all disconnected */
  }
  return out;
}

export type UpsertConnection = {
  platform: string;
  provider_account_id: string | null;
  account_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  metadata?: Record<string, string> | null;
};

export async function upsertConnection(userId: string, c: UpsertConnection): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("social_connections")
    .upsert({ user_id: userId, ...c, updated_at: new Date().toISOString() }, { onConflict: "user_id,platform" });
  if (error) throw new Error(error.message);
}

export async function deleteConnection(userId: string, platform: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("social_connections").delete().eq("user_id", userId).eq("platform", platform);
}

/**
 * A currently-valid access token for a connection, refreshing (and persisting)
 * when within 60s of expiry. Used by the YouTube publish path (Google refresh).
 */
export async function getValidAccessToken(userId: string, conn: DbConnection): Promise<string> {
  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;
  if (expiresAt && expiresAt - Date.now() > 60_000) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token;

  const refreshed = await refreshAccessToken(conn.refresh_token);
  const admin = createAdminClient();
  await admin
    .from("social_connections")
    .update({
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("platform", conn.platform);
  return refreshed.access_token;
}

function toPkgConnection(row: DbConnection): PkgConnection {
  return {
    platform: row.platform as SocialPlatform,
    accessToken: row.access_token,
    providerAccountId: row.provider_account_id,
    metadata: row.metadata ?? {},
    refreshToken: row.refresh_token,
    expiresAt: row.token_expires_at ? Date.parse(row.token_expires_at) : null,
  };
}

/**
 * A package ConnectionStore scoped to one user — what publishToAll() consumes.
 * Only used for the union platforms (facebook/instagram/threads/linkedin), whose
 * tokens are long-lived, so freshAccessToken returns the stored token.
 */
export function createConnectionStore(userId: string): ConnectionStore {
  return {
    async get(platform) {
      const c = await getConnection(userId, platform);
      return c ? toPkgConnection(c) : null;
    },
    async list() {
      const admin = createAdminClient();
      const { data } = await admin.from("social_connections").select(COLS).eq("user_id", userId);
      return ((data as DbConnection[]) ?? []).map(toPkgConnection);
    },
    async freshAccessToken(platform) {
      const c = await getConnection(userId, platform);
      if (!c) throw new Error(`${platform} isn't connected.`);
      return c.access_token;
    },
  };
}
