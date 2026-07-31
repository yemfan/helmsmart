import "server-only";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Inbound email alias management.
 *
 * Phase 1 (this file): one alias per agent, auto-created on first
 * /dashboard/calendar visit. The alias is a globally-unique local_part
 * shaped like `agent-<random6>` so it's hard to guess (mild abuse
 * deterrent — the real protection is INBOUND_PARSE_SECRET on the
 * webhook).
 *
 * Future (not here): multiple aliases per agent, regenerate-alias
 * action, per-alias intent filters.
 */

export type AgentInboundAlias = {
  id: string;
  agent_id: string;
  local_part: string;
  label: string | null;
  last_received_at: string | null;
  inbound_count: number;
};

/** Domain the inbound webhook listens on (SendGrid Inbound Parse). Override
 *  with INBOUND_EMAIL_DOMAIN; default is the live closebossai.com subdomain
 *  (leadsmart-ai.com expired). */
export function getInboundDomain(): string {
  return process.env.INBOUND_EMAIL_DOMAIN?.trim() || "inbox.closebossai.com";
}

/** Compose the full forwarding address from an alias row. */
export function aliasToAddress(alias: Pick<AgentInboundAlias, "local_part">): string {
  return `${alias.local_part}@${getInboundDomain()}`;
}

/**
 * Generate a fresh opaque local_part as the fallback path when we
 * can't derive a friendly slug from the agent's email. Format:
 * `agent-<6 lowercase hex>`. 16M-space; collision probability is
 * single-digit per 1000 inserts so we retry on the unique constraint.
 */
function freshLocalPart(): string {
  const buf = randomBytes(4); // 8 hex chars; we'll trim to 6
  const slug = buf.toString("hex").slice(0, 6).toLowerCase();
  return `agent-${slug}`;
}

/**
 * Derive a friendly local_part from an email address. The agent who
 * logs in as `fan.yes@gmail.com` gets `fan.yes@inbox.closebossai.com`
 * as their forwarding address — which feels far more like "their
 * mailbox" than the opaque `agent-b9a798@…` we used to generate.
 *
 * Rules (in this order):
 *  1. Take everything before the `@`.
 *  2. Strip Gmail-style `+tag` suffixes — `fan.yes+offers@…` becomes
 *     `fan.yes`. The tag is per-message routing metadata, not part
 *     of the agent's identity.
 *  3. Lowercase.
 *  4. Replace anything outside `[a-z0-9.\-]` with a hyphen so we don't
 *     reject names with apostrophes or non-ASCII chars; collapse
 *     consecutive hyphens.
 *  5. Strip leading/trailing dots and hyphens — the DB constraint
 *     requires `[a-z0-9]` at both ends.
 *  6. Ensure length 4–64 (the constraint allows 4–64). If too short
 *     we return null and the caller falls back to the opaque hex.
 *
 * Returns null when no usable slug survives the cleanup — caller
 * falls back to `freshLocalPart()`.
 */
export function deriveSlugFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  const raw = at >= 0 ? email.slice(0, at) : email;
  const stripped = raw.split("+")[0]; // remove +tag
  const cleaned = stripped
    .toLowerCase()
    .replace(/[^a-z0-9.\-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-]+|[.\-]+$/g, "");
  if (cleaned.length < 4 || cleaned.length > 64) return null;
  // Final regex check matches the DB constraint exactly. Belt-and-
  // suspenders against any character class case I missed above.
  if (!/^[a-z0-9][a-z0-9.\-]{2,62}[a-z0-9]$/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Build an inbound-alias slug from the agent's full name in
 * `lastname_firstname_MI` order — e.g. "Michael Ye" → `ye_michael`,
 * "Michael John Ye" → `ye_michael_j`. Assumes Western "First [Middle…]
 * Last" ordering (what signup collects). Each name token is lowercased
 * and stripped to `[a-z0-9-]`; the middle initial(s) are the first
 * letter of each middle token. Returns null when fewer than two usable
 * tokens survive — caller falls back to the email-derived slug.
 */
export function deriveSlugFromName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const cleanToken = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  const tokens = fullName.trim().split(/\s+/).map(cleanToken).filter(Boolean);
  if (tokens.length < 2) return null; // need at least a first + last name
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const mi = tokens
    .slice(1, -1)
    .map((t) => t[0])
    .join("");
  const slug = [last, first, mi].filter(Boolean).join("_");
  if (slug.length < 4 || slug.length > 64) return null;
  // Matches the (now underscore-permitting) DB constraint exactly.
  if (!/^[a-z0-9][a-z0-9._\-]{2,62}[a-z0-9]$/.test(slug)) return null;
  return slug;
}

/**
 * Look up the agent's email + display name via auth.users. Returns
 * nulls when we can't find them — caller falls back through the
 * email-derived slug to an opaque hex slug.
 *
 * Uses the same supabase.auth.admin.getUserById path that
 * resolveAgentDisplay + getAgentForwardingInfo use, since
 * `agents.email` doesn't exist (verified PR #326).
 */
async function getAgentIdentity(
  agentId: string,
): Promise<{ email: string | null; fullName: string | null }> {
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId as any)
    .maybeSingle();
  const authUserId = (agent as { auth_user_id?: string | null } | null)
    ?.auth_user_id;
  if (!authUserId) return { email: null, fullName: null };
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(String(authUserId));
    const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const rawName =
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      "";
    return {
      email: data?.user?.email ?? null,
      fullName: rawName.trim() || null,
    };
  } catch {
    return { email: null, fullName: null };
  }
}

/**
 * Get the agent's alias, creating one if missing. First-call lazy
 * provisioning so existing agents start working without a backfill.
 *
 * Race: if two requests for the same agent fire simultaneously, the
 * unique constraint on (agent_id) — which we don't have, but
 * effectively one alias per agent — is enforced via "select first,
 * insert if missing". Two parallel inserts could create two aliases
 * for the same agent. Rare and harmless (we just return the first
 * one on the next read), so not worth a SELECT FOR UPDATE here.
 */
async function tryInsertAlias(
  agentId: string,
  localPart: string,
): Promise<AgentInboundAlias | null> {
  const { data, error } = await supabaseAdmin
    .from("agent_inbound_aliases")
    .insert({ agent_id: agentId as any, local_part: localPart } as any)
    .select()
    .maybeSingle();
  if (data) return data as AgentInboundAlias;
  if (error && !/unique/i.test(error.message)) {
    throw new Error(error.message);
  }
  // unique-violation → caller retries with a different local_part
  return null;
}

export async function ensureAgentAlias(agentId: string): Promise<AgentInboundAlias> {
  const { data: existing } = await supabaseAdmin
    .from("agent_inbound_aliases")
    .select("*")
    .eq("agent_id", agentId as any)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as AgentInboundAlias;

  // Pass 0/1: try the name-derived slug (lastname_firstname_MI) first,
  // then the email-derived friendly slug, each with numeric suffixes on
  // collision. "Michael Ye" → `ye_michael`, then `ye_michael2`, …;
  // `fan.yes@gmail.com` → `fan.yes`, then `fan.yes2`, …. After 10
  // attempts on each we fall through to the opaque-hex pass.
  const { email, fullName } = await getAgentIdentity(agentId);
  const baseSlugs = [deriveSlugFromName(fullName), deriveSlugFromEmail(email)];
  for (const baseSlug of baseSlugs) {
    if (!baseSlug) continue;
    for (let i = 0; i < 10; i++) {
      const candidate = i === 0 ? baseSlug : `${baseSlug}${i + 1}`;
      // Numeric suffix could push past the 64-char limit on long names.
      // Skip rather than throw.
      if (candidate.length > 64) break;
      const result = await tryInsertAlias(agentId, candidate);
      if (result) return result;
    }
  }

  // Pass 2: opaque hex fallback. 16M-space, retry up to 5 times on
  // unique-violation. Should basically never trigger for a real
  // agent because email-derived slugs collide rarely.
  for (let attempt = 0; attempt < 5; attempt++) {
    const localPart = freshLocalPart();
    const result = await tryInsertAlias(agentId, localPart);
    if (result) return result;
  }
  throw new Error("Could not provision an inbound alias after 5 attempts");
}

/**
 * Webhook lookup — find the agent owning a given local_part. Returns
 * null when the local_part doesn't map to any alias (random POSTs
 * targeting `info@` etc. should be silently dropped).
 */
export async function findAgentByLocalPart(
  localPart: string,
): Promise<AgentInboundAlias | null> {
  const { data } = await supabaseAdmin
    .from("agent_inbound_aliases")
    .select("*")
    .eq("local_part", localPart.toLowerCase())
    .maybeSingle();
  return (data as AgentInboundAlias | null) ?? null;
}

/**
 * Per-alias daily delivery cap. With friendly slugs (PR shipping
 * this), an attacker can guess inbox addresses from a public-ish
 * customer roster. The cap bounds abuse damage: even if every alias
 * is leaked, no single agent's task list can be flooded past this
 * rolling-24h ceiling.
 *
 * Tuned for early stage — most agents process well under 50 forwarded
 * emails/day. We can raise this per-account (or per-plan) later
 * without code changes by surfacing a `daily_delivery_cap` column
 * on `agent_inbound_aliases`.
 */
export const DEFAULT_DAILY_DELIVERY_CAP = 100;

/**
 * Count how many deliveries this alias has received in the last 24
 * hours. Used by the webhook to enforce DEFAULT_DAILY_DELIVERY_CAP.
 *
 * Window is rolling, not calendar-day, to prevent the "midnight
 * floodgate" pattern (attacker waits for the calendar reset and
 * dumps another 100 emails immediately).
 */
export async function countRecentDeliveriesForAlias(aliasId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("inbound_email_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("alias_id", aliasId as any)
    .gte("created_at", since);
  if (error) {
    // Fail open — a count error shouldn't drop legitimate inbound
    // mail. Errs on the side of "process the email"; the cap is
    // soft anyway.
    console.warn("[inbound] rate-limit count query failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Bump the inbound_count + last_received_at after a successful delivery. */
export async function recordInboundDelivery(aliasId: string): Promise<void> {
  // No atomic increment helper available — do a select-then-update so
  // the RPC isn't required. Concurrent deliveries to the same alias
  // are rare; a small race window where the count is off by one is
  // acceptable for this stat.
  const { data: row } = await supabaseAdmin
    .from("agent_inbound_aliases")
    .select("inbound_count")
    .eq("id", aliasId as any)
    .maybeSingle();
  const current = (row as { inbound_count: number } | null)?.inbound_count ?? 0;
  await supabaseAdmin
    .from("agent_inbound_aliases")
    .update({
      inbound_count: current + 1,
      last_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", aliasId as any);
}
