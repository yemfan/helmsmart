import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Anonymous, session-free Supabase client for public data.
 *
 * Marketing pages read the published compensation plan, the legal documents and
 * the partner directory. None of that depends on who is asking, and binding
 * those reads to request cookies would make every public page dynamic. This
 * client carries no session, so those pages can be statically rendered and
 * revalidated - and RLS still applies, because it uses the anon key.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
