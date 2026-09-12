import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Browserless Supabase client for Realtime: same project as CloseBoss web.
 * Pass the same Supabase access JWT used for `/api/mobile/*` (Bearer).
 *
 * Realtime applies RLS; see migration `20260460000000_mobile_message_realtime_rls.sql`.
 */
export function createMobileSupabaseClient(accessToken: string): SupabaseClient | null {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey || !accessToken.trim()) return null;

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken.trim()}` },
    },
  });

  const rt = client.realtime as unknown as { setAuth?: (token: string) => void };
  rt.setAuth?.(accessToken.trim());

  return client;
}
