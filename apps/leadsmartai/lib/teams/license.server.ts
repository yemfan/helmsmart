import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAgentDisplayName } from "@/lib/ai-call/lead-resolution";
import { lookupLicenseRecord } from "@/lib/licenses/lookup.server";
import type { DreRecord } from "@/lib/licenses/ca-dre";
import { loadBrandForAgent } from "./brand.server";
import { brokerageLine, checkLicenseFormat, ensureBrokerageLine, statusFromLookup, type AgentLicense, type LicenseRecord, type LicenseStatus } from "./license";

/**
 * Agent licenses: read, save, look up, fill in.
 *
 * Saving writes agent_licenses (number, state) and mirrors the number into
 * leadsmart_users.license_number, which the hub footer, the CMA and the
 * report PDFs already print. Then the regulator's public record is read
 * (California DRE today, free): the record confirms the license, and its
 * details fill in what the agent left blank — their name on the profile,
 * the brokerage they hang with. Where no public record exists, a manager
 * confirms by hand on the onboarding board.
 */

type Row = {
  agent_id: unknown;
  license_number: string;
  state: string;
  status: LicenseStatus;
  verified_at: string | null;
  verified_by: "record" | "manager" | null;
  holder_name: string | null;
  license_type: string | null;
  status_raw: string | null;
  expires_on: string | null;
  issued_on: string | null;
  responsible_broker_id: string | null;
  responsible_broker_name: string | null;
  looked_up_at: string | null;
  record: { discipline?: string | null; active?: boolean } | null;
};

const COLS = "agent_id, license_number, state, status, verified_at, verified_by, holder_name, license_type, status_raw, expires_on, issued_on, responsible_broker_id, responsible_broker_name, looked_up_at, record";

function toLicense(r: Row): AgentLicense {
  const record: LicenseRecord | null = r.looked_up_at
    ? {
        holderName: r.holder_name,
        licenseType: r.license_type,
        statusRaw: r.status_raw,
        active: Boolean(r.record?.active),
        expiresOn: r.expires_on,
        issuedOn: r.issued_on,
        responsibleBroker: r.responsible_broker_id || r.responsible_broker_name ? { id: r.responsible_broker_id ?? "", name: r.responsible_broker_name ?? "" } : null,
        discipline: r.record?.discipline ?? null,
        lookedUpAt: r.looked_up_at,
      }
    : null;
  return { agentId: String(r.agent_id), number: r.license_number, state: r.state, status: r.status, verifiedAt: r.verified_at, verifiedBy: r.verified_by, record };
}

export async function loadAgentLicense(agentId: string): Promise<AgentLicense | null> {
  try {
    const { data } = await supabaseAdmin.from("agent_licenses").select(COLS).eq("agent_id", agentId as never).maybeSingle();
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
    const { data } = await supabaseAdmin.from("agent_licenses").select(COLS).in("agent_id", ids as never[]);
    for (const r of (data as Row[] | null) ?? []) out.set(String(r.agent_id), toLicense(r));
  } catch (e) {
    console.warn("[teams.license] team load failed:", e instanceof Error ? e.message : e);
  }
  return out;
}

async function authUserId(agentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("agents").select("auth_user_id").eq("id", agentId as never).maybeSingle();
  return (data as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;
}

async function mirrorToProfile(agentId: string, number: string): Promise<void> {
  const uid = await authUserId(agentId);
  if (!uid) return;
  const { data: updated } = await supabaseAdmin.from("leadsmart_users").update({ license_number: number } as never).eq("user_id", uid).select("user_id");
  if (!updated || (updated as unknown[]).length === 0) {
    await supabaseAdmin.from("leadsmart_users").insert({ user_id: uid, license_number: number } as never);
  }
}

/**
 * Fill in what the agent left blank from the public record — never
 * overwrite what they typed. Name on the profile; brokerage on the account.
 */
async function populateFromRecord(agentId: string, record: DreRecord): Promise<void> {
  const uid = await authUserId(agentId);
  if (!uid) return;
  if (record.displayName) {
    const { data: prof } = await supabaseAdmin.from("user_profiles").select("full_name").eq("user_id", uid).maybeSingle();
    const current = (prof as { full_name?: string | null } | null)?.full_name?.trim();
    if (prof && !current) await supabaseAdmin.from("user_profiles").update({ full_name: record.displayName } as never).eq("user_id", uid);
  }
  if (record.responsibleBroker?.name) {
    const { data: lu } = await supabaseAdmin.from("leadsmart_users").select("brokerage").eq("user_id", uid).maybeSingle();
    const current = (lu as { brokerage?: string | null } | null)?.brokerage?.trim();
    if (lu && !current) await supabaseAdmin.from("leadsmart_users").update({ brokerage: record.responsibleBroker.name } as never).eq("user_id", uid);
  }
}

/** Read the regulator's record for a saved license and store what it says. Null when nothing changed. */
export async function refreshLicenseRecord(agentId: string): Promise<AgentLicense | null> {
  const current = await loadAgentLicense(agentId);
  if (!current) return null;
  const result = await lookupLicenseRecord(current.state, current.number);
  const status = statusFromLookup(result.kind, result.kind === "found" ? result.record : null);
  if (!status) {
    if (result.kind === "error") console.warn("[teams.license] lookup failed:", result.message);
    return null;
  }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now };
  if (result.kind === "found") {
    const r = result.record;
    Object.assign(patch, {
      holder_name: r.displayName || null,
      license_type: r.licenseType || null,
      status_raw: r.statusRaw || null,
      expires_on: r.expiresOn,
      issued_on: r.issuedOn,
      responsible_broker_id: r.responsibleBroker?.licenseId ?? null,
      responsible_broker_name: r.responsibleBroker?.name ?? null,
      looked_up_at: now,
      record: r,
      verified_at: status === "verified" ? now : null,
      verified_by: status === "verified" ? "record" : null,
    });
    await populateFromRecord(agentId, r).catch((e) => console.warn("[teams.license] populate failed:", e instanceof Error ? e.message : e));
  } else {
    Object.assign(patch, { looked_up_at: result.kind === "not_found" ? now : null, record: null, verified_at: null, verified_by: null });
  }
  const { data } = await supabaseAdmin.from("agent_licenses").update(patch as never).eq("agent_id", agentId as never).select(COLS).maybeSingle();
  return data ? toLicense(data as Row) : null;
}

export type SaveLicenseResult = { ok: true; license: AgentLicense } | { ok: false; reason: "state" | "empty" | "format" | "failed" };

export async function saveAgentLicense(args: { agentId: string; state: string; number: string }): Promise<SaveLicenseResult> {
  const check = checkLicenseFormat(args.state, args.number);
  if (!check.ok) return { ok: false, reason: check.reason };
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("agent_licenses")
      .upsert(
        {
          agent_id: args.agentId,
          license_number: check.number,
          state: check.state,
          status: "format_ok",
          verified_at: null,
          verified_by: null,
          verified_by_agent_id: null,
          holder_name: null,
          license_type: null,
          status_raw: null,
          expires_on: null,
          issued_on: null,
          responsible_broker_id: null,
          responsible_broker_name: null,
          looked_up_at: null,
          record: null,
          updated_at: now,
        } as never,
        { onConflict: "agent_id" },
      )
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    await mirrorToProfile(args.agentId, check.number).catch((e) => console.warn("[teams.license] mirror failed:", e instanceof Error ? e.message : e));
    const refreshed = await refreshLicenseRecord(args.agentId).catch(() => null);
    return { ok: true, license: refreshed ?? toLicense(data as Row) };
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
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toLicense(data as Row) : null;
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
