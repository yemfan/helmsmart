import "server-only";

import { loadAgentDisplayIdentities } from "@/lib/agents/displayIdentity.server";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  buildLeadRoutingRoster,
  type RosterAssignmentInput,
  type RosterAgentMeta,
  type RosterItem,
  type RosterRuleInput,
} from "./adminRoster";
import { IDX_LEAD_SOURCE } from "./service";
import { parseAgentZipCoverage } from "./zipCoverage";

/**
 * Server orchestrator for the listing-leads admin view.
 *
 * Composes three reads:
 *   1. agent_lead_routing — per-agent rules
 *   2. agents — display name lookup
 *   3. contacts — last assignment + recent count per agent (IDX leads)
 *
 * Then folds the env-allowlist + env-coverage on top so admin sees the
 * complete picture (DB + env, with DB taking precedence on overlap).
 *
 * Service-role reads bypass RLS — appropriate for an admin operational
 * view. We expose only operational columns (not email/phone) so the
 * data shown is the same shape an agent would see if RLS was enabled.
 */

export type GetRoutingPoolRosterResult = {
  roster: RosterItem[];
  /** Used by the page to surface "you're using the env fallback" hint
   *  when no DB rows exist yet. */
  hasDbRules: boolean;
};

const RECENT_LEAD_LOOKBACK_DAYS = 30;

export async function getRoutingPoolRoster(): Promise<GetRoutingPoolRosterResult> {
  const sinceIso = new Date(
    Date.now() - RECENT_LEAD_LOOKBACK_DAYS * 86_400_000,
  ).toISOString();

  // 1. DB rules — every row, including in_round_robin=false (admin sees opt-outs).
  const { data: ruleRows, error: ruleErr } = await supabaseAdmin
    .from("agent_lead_routing")
    .select("agent_id, in_round_robin, zip_coverage, priority, updated_at");
  if (ruleErr) {
    console.warn("[adminService.getRoutingPoolRoster] rules query failed:", ruleErr.message);
  }

  const rules: RosterRuleInput[] = ((ruleRows ?? []) as Array<{
    agent_id: string | number;
    in_round_robin: boolean | null;
    zip_coverage: string[] | null;
    priority: number | null;
    updated_at: string | null;
  }>).map((r) => ({
    agentId: String(r.agent_id),
    inRoundRobin: Boolean(r.in_round_robin),
    zipCoverage: Array.isArray(r.zip_coverage) ? r.zip_coverage : [],
    priority: typeof r.priority === "number" ? r.priority : 0,
    rulesUpdatedAt: r.updated_at,
  }));

  // 2. Env layer.
  const envAllowlist = parseAllowlist(process.env.IDX_ROUND_ROBIN_AGENT_IDS);
  const envCoverageMap = parseAgentZipCoverage(process.env.IDX_AGENT_ZIP_COVERAGE);
  const envZipCoverage = new Map<string, ReadonlyArray<string>>();
  for (const [agentId, set] of envCoverageMap) {
    envZipCoverage.set(agentId, Array.from(set));
  }

  // Determine the union of agent ids we need metadata + assignment data for.
  const wantedAgentIds = new Set<string>();
  for (const r of rules) wantedAgentIds.add(r.agentId);
  for (const id of envAllowlist) wantedAgentIds.add(id);
  const agentIdList = Array.from(wantedAgentIds);

  const [agentMeta, assignments] = await Promise.all([
    fetchAgentMeta(agentIdList),
    fetchAssignmentMetrics(agentIdList, sinceIso),
  ]);

  const roster = buildLeadRoutingRoster({
    rules,
    envAllowlist,
    envZipCoverage,
    agentMeta,
    assignments,
  });

  return { roster, hasDbRules: rules.length > 0 };
}

async function fetchAgentMeta(agentIds: string[]): Promise<RosterAgentMeta[]> {
  if (agentIds.length === 0) return [];
  try {
    // Names live on user_profiles, not agents.
    const identities = await loadAgentDisplayIdentities(agentIds);
    return [...identities.values()].map((a) => ({ agentId: a.agentId, displayName: a.fullName }));
  } catch (e) {
    console.warn("[adminService.fetchAgentMeta] failed:", e);
    return [];
  }
}

/**
 * For each agent in `agentIds`, look up:
 *   - assignmentCountLast30Days = count(contacts where source=idx and
 *     created_at >= sinceIso)
 *   - lastAssignmentAt = max(created_at) for those rows
 */
async function fetchAssignmentMetrics(
  agentIds: string[],
  sinceIso: string,
): Promise<RosterAssignmentInput[]> {
  if (agentIds.length === 0) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("agent_id, created_at")
      .eq("source", IDX_LEAD_SOURCE)
      .in("agent_id", agentIds as unknown as never[])
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      agent_id: string | number | null;
      created_at: string;
    }>;

    const counts = new Map<string, { count: number; latest: string }>();
    for (const r of rows) {
      if (r.agent_id == null) continue;
      const key = String(r.agent_id);
      const existing = counts.get(key);
      if (!existing) {
        counts.set(key, { count: 1, latest: r.created_at });
      } else {
        existing.count += 1;
        if (r.created_at > existing.latest) existing.latest = r.created_at;
      }
    }

    return agentIds.map((agentId) => {
      const c = counts.get(agentId);
      return {
        agentId,
        lastAssignmentAt: c?.latest ?? null,
        assignmentCountLast30Days: c?.count ?? 0,
      };
    });
  } catch (e) {
    console.warn("[adminService.fetchAssignmentMetrics] failed:", e);
    return [];
  }
}

function parseAllowlist(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== "string") return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
