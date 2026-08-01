import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken } from "@/lib/youtube";

/**
 * Read/write helpers for social_connections (RLS-denied — service role only).
 * Keeps OAuth tokens off the client entirely.
 */

export type SocialConnection = {
  platform: string;
  provider_account_id: string | null;
  account_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
};

export async function getConnection(
  userId: string,
  platform: string,
): Promise<SocialConnection | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("social_connections")
    .select("platform, provider_account_id, account_name, access_token, refresh_token, token_expires_at, scope")
    .eq("user_id", userId)
    .eq("platform", platform)
    .maybeSingle();
  return (data as SocialConnection) ?? null;
}

/** Non-secret status for the UI ({ connected, accountName }). Never returns tokens. */
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

export async function upsertConnection(
  userId: string,
  c: {
    platform: string;
    provider_account_id: string | null;
    account_name: string | null;
    access_token: string;
    refresh_token: string | null;
    token_expires_at: string | null;
    scope: string | null;
  },
): Promise<void> {
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
 * A currently-valid access token for the user's connection, refreshing (and
 * persisting the new token) when it's within 60s of expiry.
 */
export async function getValidAccessToken(
  userId: string,
  conn: SocialConnection,
): Promise<string> {
  const expiresAt = conn.token_expires_at ? Date.parse(conn.token_expires_at) : 0;
  if (expiresAt && expiresAt - Date.now() > 60_000) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token; // best effort; may 401 and prompt reconnect

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
