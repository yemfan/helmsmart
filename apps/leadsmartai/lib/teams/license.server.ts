import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAgentDisplayName } from "@/lib/ai-call/lead-resolution";
import { loadBrandForAgent } from "./brand.server";
import { brokerageLine, canVerifyViaArello, checkLicenseFormat, ensureBrokerageLine, verificationOutcome, type AgentLicense, type ArelloHit, type LicenseStatus } from "./license";

/**
 * Agent licenses: read, save, verify.
 *
 * Saving writes agent_licenses (number, state, status) and mirrors the
 * number into leadsmart_users.license_number, which the hub footer, the
 * CMA and the report PDFs already print. Verification runs against the
 * ARELLO licensee web service when ARELLO_API_TOKEN is set and the state
 * participates; otherwise the record stays "format_ok" until a manager
 * marks it verified after checking the regulator's own lookup.
 */

type Row = { agent_id: unknown; license_number: string; state: string; status: LicenseStatus; verified_at: string | null; verified_by: "arello" | "manager" | null };

function toLicense(r: Row): AgentLicense {
  return { agentId: String(r.agent_id), number: r.license_number, state: r.state, status: r.status, verifiedAt: r.verified_at, verifiedBy: r.verified_by };
}

export async function loadAgentLicense(agentId: string): Promise<AgentLicense | null> {
  try {
    const { data } = await supabaseAdmin.from("agent_licenses").select("agent_id, license_number, state, status, verified_at, verified_by").eq("agent_id", agentId as never).maybeSingle();
    return data ? toLicense(data as Row) : null;
  } catch (e) {
    console.warn("[teams.license] load failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function loadTeamLicenses(teamId: string): Promise<Map<string, AgentLicense>> {
  const out = new Map<string, AgentLicense>();
  try {
    const { data: members } = await supabaseAdmin.from("team_memberships").select("agent_id").eq("team_id", teamId).limit(3000);
    const ids = ((members as { agent_id: unknown }[] | null) ?? []).map((m) => String(m.agent_id));
    if (!ids.length) return out;
    const { data } = await supabaseAdmin.from("agent_licenses").select("agent_id, license_number, state, status, verified_at, verified_by").in("agent_id", ids as never[]);
    for (const r of (data as Row[] | null) ?? []) out.set(String(r.agent_id), toLicense(r));
  } catch (e) {
    console.warn("[teams.license] team load failed:", e instanceof Error ? e.message : e);
  }
  return out;
}

async function mirrorToProfile(agentId: string, number: string): Promise<void> {
  const { data: agent } = await supabaseAdmin.from("agents").select("auth_user_id").eq("id", agentId as never).maybeSingle();
  const uid = (agent as { auth_user_id?: string | null } | null)?.auth_user_id;
  if (!uid) return;
  const { data: updated } = await supabaseAdmin.from("leadsmart_users").update({ license_number: number } as never).eq("user_id", uid).select("user_id");
  if (!updated || (updated as unknown[]).length === 0) {
    await supabaseAdmin.from("leadsmart_users").insert({ user_id: uid, license_number: number } as never);
  }
}

export type SaveLicenseResult = { ok: true; license: AgentLicense } | { ok: false; reason: "state" | "empty" | "format" | "failed" };

export async function saveAgentLicense(args: { agentId: string; state: string; number: string }): Promise<SaveLicenseResult> {
  const check = checkLicenseFormat(args.state, args.number);
  if (!check.ok) return { ok: false, reason: check.reason };
  try {
    const { data, error } = await supabaseAdmin
      .from("agent_licenses")
      .upsert({ agent_id: args.agentId, license_number: check.number, state: check.state, status: "format_ok", verified_at: null, verified_by: null, verified_by_agent_id: null, payload: null, updated_at: new Date().toISOString() } as never, { onConflict: "agent_id" })
      .select("agent_id, license_number, state, status, verified_at, verified_by")
      .single();
    if (error) throw new Error(error.message);
    await mirrorToProfile(args.agentId, check.number).catch((e) => console.warn("[teams.license] mirror failed:", e instanceof Error ? e.message : e));
    let license = toLicense(data as Row);
    const verified = await verifyAgentLicense(args.agentId).catch(() => null);
    if (verified) license = verified;
    return { ok: true, license };
  } catch (e) {
    console.error("[teams.license] save failed:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "failed" };
  }
}

/** A manager checked the regulator's lookup by hand. */
export async function markLicenseVerified(args: { agentId: string; byAgentId: string }): Promise<AgentLicense | null> {
  const { data, error } = await supabaseAdmin
    .from("agent_licenses")
    .update({ status: "verified", verified_at: new Date().toISOString(), verified_by: "manager", verified_by_agent_id: args.byAgentId, updated_at: new Date().toISOString() } as never)
    .eq("agent_id", args.agentId as never)
    .select("agent_id, license_number, state, status, verified_at, verified_by")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toLicense(data as Row) : null;
}

const ARELLO_URL = "https://api.sourceredb.com/Search";

export function arelloConfigured(): boolean {
  return Boolean(process.env.ARELLO_API_TOKEN?.trim());
}

/**
 * Ask ARELLO. Returns the updated license, or null when there is no token,
 * the state does not participate, or the service failed (the record is
 * then left as it was — "unavailable" only when we know the state is not
 * covered, never for a transient error).
 */
export async function verifyAgentLicense(agentId: string): Promise<AgentLicense | null> {
  const current = await loadAgentLicense(agentId);
  if (!current) return null;
  const stamp = new Date().toISOString();
  const store = async (status: LicenseStatus, payload: unknown, verified: boolean) => {
    const { data } = await supabaseAdmin
      .from("agent_licenses")
      .update({ status, payload, verified_at: verified ? stamp : null, verified_by: verified ? "arello" : null, updated_at: stamp } as never)
      .eq("agent_id", agentId as never)
      .select("agent_id, license_number, state, status, verified_at, verified_by")
      .maybeSingle();
    return data ? toLicense(data as Row) : null;
  };
  if (!canVerifyViaArello(current.state)) return store("unavailable", { reason: "jurisdiction_not_in_arello" }, false);
  const token = process.env.ARELLO_API_TOKEN?.trim();
  if (!token) return null;

  const form = new URLSearchParams({ jurisdiction: current.state, licenseNumber: current.number, maxResults: "10", searchMode: process.env.ARELLO_SEARCH_MODE?.trim() || "live" });
  const res = await fetch(ARELLO_URL, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(), signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    console.warn("[teams.license] ARELLO", res.status);
    return null;
  }
  const json = (await res.json()) as unknown;
  const hits: ArelloHit[] = Array.isArray(json) ? (json as ArelloHit[]) : Array.isArray((json as { results?: unknown })?.results) ? ((json as { results: ArelloHit[] }).results) : [];
  const name = await getAgentDisplayName(agentId).catch(() => null);
  const lastName = name ? name.trim().split(/\s+/).slice(-1)[0] : null;
  const outcome = verificationOutcome(hits, { number: current.number, lastName });
  return store(outcome.status, { checkedAt: stamp, hit: outcome.hit }, outcome.status === "verified");
}

/**
 * The line every published post carries when the agent is on a team with
 * a brand: brokerage name and license, then the agent and their license.
 * Null for an agent on no team — nothing is required of them here.
 */
export async function brokerageLineForAgent(agentId: string): Promise<{ line: string | null; brandName: string | null }> {
  const [brand, license, name] = await Promise.all([loadBrandForAgent(agentId).catch(() => null), loadAgentLicense(agentId), getAgentDisplayName(agentId).catch(() => null)]);
  if (!brand) return { line: null, brandName: null };
  const line = brokerageLine({ brandName: brand.name, brandLicense: brand.license, agentName: name, agentLicense: license ? { number: license.number, state: license.state } : null });
  return { line, brandName: brand.name };
}

export async function withBrokerageLine(agentId: string, caption: string): Promise<string> {
  try {
    const { line, brandName } = await brokerageLineForAgent(agentId);
    return ensureBrokerageLine(caption, line, brandName);
  } catch (e) {
    console.warn("[teams.license] brokerage line skipped:", e instanceof Error ? e.message : e);
    return caption;
  }
}
