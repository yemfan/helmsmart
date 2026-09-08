import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { listAdAccountsForUser } from "./meta-ads";
import { META_GRAPH_BASE } from "./meta-oauth";
import { decryptToken } from "./token-enc";

/**
 * The Meta Pixels an agent can see, so the hub's Settings card can offer them
 * instead of asking for a 15-digit id. Pixels hang off ad accounts, and ad
 * accounts off the user (not the Page), so this uses the Facebook
 * connection's user token and the ads permission it was granted.
 */

export type MetaPixel = { id: string; name: string | null; adAccountName: string | null; lastFiredAt: string | null };

export type MetaPixelsResult =
  | { ok: true; pixels: MetaPixel[] }
  | { ok: false; reason: "not_connected" | "needs_ads_permission" | "read_failed"; message?: string };

/** Ad accounts read per call: a brokerage Business Manager can hold dozens; the agent's own are the active ones. */
const MAX_AD_ACCOUNTS = 10;

export async function listMetaPixelsForAgent(agentId: string): Promise<MetaPixelsResult> {
  const { data } = await supabaseAdmin
    .from("social_accounts")
    .select("id, user_access_token_enc, scopes, status")
    .eq("agent_id", agentId as never)
    .eq("platform", "meta")
    .eq("status", "connected")
    .order("connected_at", { ascending: false })
    .limit(5);
  const rows = (data as { id: string; user_access_token_enc: string | null; scopes: string[] | null }[] | null) ?? [];
  const conn = rows.find((r) => r.user_access_token_enc);
  if (!conn) return { ok: false, reason: "not_connected" };
  const scopes = new Set(conn.scopes ?? []);
  if (!scopes.has("ads_read") && !scopes.has("ads_management")) return { ok: false, reason: "needs_ads_permission" };

  try {
    const token = decryptToken(conn.user_access_token_enc!);
    const accounts = (await listAdAccountsForUser(token)).slice(0, MAX_AD_ACCOUNTS);
    const seen = new Set<string>();
    const pixels: MetaPixel[] = [];
    for (const acct of accounts) {
      const res = await fetch(
        `${META_GRAPH_BASE}/${acct.id}/adspixels?fields=id,name,last_fired_time&limit=50&access_token=${encodeURIComponent(token)}`,
      );
      const body = (await res.json().catch(() => ({}))) as { data?: { id?: string; name?: string; last_fired_time?: string }[]; error?: { message?: string } };
      if (!res.ok) {
        // One account we cannot read (a closed one, say) should not hide the others.
        console.warn("[meta-pixels]", acct.id, body.error?.message ?? res.status);
        continue;
      }
      for (const p of body.data ?? []) {
        if (!p.id || seen.has(p.id)) continue;
        seen.add(p.id);
        pixels.push({ id: p.id, name: p.name ?? null, adAccountName: acct.name, lastFiredAt: p.last_fired_time ?? null });
      }
    }
    // The pixel that fired most recently is the one in use.
    pixels.sort((a, b) => (b.lastFiredAt ?? "").localeCompare(a.lastFiredAt ?? ""));
    return { ok: true, pixels };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[meta-pixels] read failed:", message);
    return { ok: false, reason: "read_failed", message };
  }
}
