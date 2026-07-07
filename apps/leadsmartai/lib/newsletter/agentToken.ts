import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Phase 3 — resolve an agent's public newsletter token to their agents.id.
 *
 * The token is an opaque UUID stored on agents.newsletter_token (unique). It
 * appears in the shareable client-signup link (/newsletter/a/[token]) and in
 * the subscribe POST body (agentToken). Reads go through the service-role
 * client (agents is not publicly readable). Returns null for a
 * missing/malformed/unknown token — callers then treat the request as public.
 *
 * agents.id is a bigint; we return it as a number (JS-safe for agent id ranges).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveAgentIdByNewsletterToken(
  token: string | null | undefined,
): Promise<number | null> {
  const t = typeof token === "string" ? token.trim() : "";
  if (!UUID_RE.test(t)) return null;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;

  const { data, error } = await supabaseServer
    .from("agents")
    .select("id")
    .eq("newsletter_token", t)
    .maybeSingle();

  if (error || !data) return null;
  const id = (data as { id: number | string | null }).id;
  if (id === null || id === undefined) return null;
  const num = typeof id === "number" ? id : Number(id);
  return Number.isFinite(num) ? num : null;
}
