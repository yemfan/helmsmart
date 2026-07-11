import "server-only";

import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadAgentIdentity } from "@/lib/cma/loadAgentIdentity";
import { getAgentAiSettings } from "@/lib/agent-ai/settings";
import { parseServiceAreas, serviceAreaLabel } from "@/lib/geo/serviceArea";
import { GLOBAL_PREAMBLE, getSkill, type Skill, type SkillAssignee } from "./catalog";
import { compliancePlaceholders } from "./compliance";
import { getAgentStateCompliance, getResolvedSkills } from "./service";

/**
 * Skill execution (Phase 2). Resolves a skill's prompt from the catalog +
 * agent profile + compliance state + the caller's inputs, runs it through
 * Claude, and — for public-facing content — chains the Boss compliance
 * validators (Fair Housing + advertising) as a gate before the output is
 * marked client-ready.
 */

const MODEL = "claude-sonnet-4-6";

/** Placeholders filled automatically from the agent profile + compliance state. */
const AUTO_KEYS = new Set([
  "agent_name", "brokerage", "license_number", "license_label", "market", "language", "brand_voice",
  "state", "license_authority", "avm_disclaimer_rule", "protected_classes",
]);

/** Placeholders in a skill that the CALLER must supply (form fields / Boss params). */
export function skillInputKeys(skill: Skill): string[] {
  const tokens = new Set<string>();
  for (const m of `${GLOBAL_PREAMBLE}\n${skill.prompt}`.matchAll(/\{\{(\w+)\}\}/g)) tokens.add(m[1]);
  return [...tokens].filter((k) => !AUTO_KEYS.has(k));
}

function langLabel(code: string): string {
  if (code === "zh" || code === "zh-Hans") return "Simplified Chinese";
  if (code === "bilingual" || code === "en-zh") return "English and Chinese (bilingual)";
  return "English";
}

async function agentPlaceholders(agentId: string): Promise<Record<string, string>> {
  const [identity, ai, areaRow] = await Promise.all([
    loadAgentIdentity(agentId),
    getAgentAiSettings(agentId),
    supabaseAdmin.from("agents").select("service_areas_v2").eq("id", agentId).maybeSingle(),
  ]);
  const areas = parseServiceAreas((areaRow.data as { service_areas_v2?: unknown } | null)?.service_areas_v2);
  const market = areas.length ? areas.map(serviceAreaLabel).slice(0, 3).join("; ") : "";
  const brandVoice = ai.styleNotes?.trim() || `${ai.personality} and professional`;
  return {
    agent_name: identity.name ?? "the agent",
    brokerage: identity.brokerage ?? "",
    license_number: identity.licenseNumber ?? "",
    market,
    language: langLabel(ai.defaultLanguage),
    brand_voice: brandVoice,
  };
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) =>
    values[k] !== undefined && values[k] !== "" ? values[k] : "(not provided — ask for it)",
  );
}

async function claude(system: string, user: string, maxTokens = 2000): Promise<string> {
  const client = getAnthropicClient();
  const res = await client.messages.create({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] });
  const tb = res.content.find((b) => b.type === "text");
  return tb && tb.type === "text" ? tb.text.trim() : "";
}

export type ComplianceGate = {
  status: "pass" | "flag";
  issues: Array<{ issue: string; rewrite?: string }>;
};

/** Public marketing/comms skills get the compliance gate; analytical/internal ones don't. */
function producesPublicContent(skill: Skill): boolean {
  if (skill.isValidator) return false;
  return ["lead_gen", "listing", "communication", "operations"].includes(skill.pillar);
}

/** Chain the Boss validators (Fair Housing + advertising) as one structured gate. */
async function runComplianceGate(output: string, values: Record<string, string>): Promise<ComplianceGate> {
  const system =
    "You are the compliance gate on a real estate agent's AI team (the Boss Assistant's validators). " +
    `Check the draft for Fair Housing issues (no reference or coded language to protected classes: ${values.protected_classes}; ` +
    "no \"safe/exclusive/perfect for [group]/walking distance to church/school\") AND advertising compliance " +
    `(${values.state}: license ${values.license_label}${values.license_number} + brokerage present on public assets; ${values.avm_disclaimer_rule} if a value estimate appears). ` +
    'Output ONLY JSON: { "status": "pass" | "flag", "issues": [ { "issue": string, "rewrite": string } ] }. Empty issues array when it passes.';
  try {
    const text = await claude(system, `Draft:\n${output.slice(0, 6000)}`, 800);
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? (JSON.parse(m[0]) as ComplianceGate) : null;
    if (parsed && (parsed.status === "pass" || parsed.status === "flag")) {
      return { status: parsed.status, issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 12) : [] };
    }
  } catch {
    /* fail open — don't block the draft on a gate error */
  }
  return { status: "pass", issues: [] };
}

export type RunSkillResult =
  | { ok: true; output: string; assignee: SkillAssignee; gate: ComplianceGate | null }
  | { ok: false; error: string };

export async function runSkill(
  agentId: string,
  skillId: string,
  inputs: Record<string, string>,
): Promise<RunSkillResult> {
  const skill = getSkill(skillId);
  if (!skill) return { ok: false, error: "Unknown skill." };
  if (!isAnthropicConfigured()) return { ok: false, error: "AI is not configured." };

  // Effective assignee (respects the agent's reassignment) + enabled check.
  const resolved = (await getResolvedSkills(agentId)).find((s) => s.id === skillId);
  if (resolved && !resolved.enabled) return { ok: false, error: "This skill is turned off. Enable it in Skills first." };
  const assignee: SkillAssignee = resolved?.assignee ?? skill.defaultAssignee;

  const compliance = await getAgentStateCompliance(agentId);
  const values: Record<string, string> = {
    ...compliancePlaceholders(compliance),
    ...(await agentPlaceholders(agentId)),
    license_label: compliance.licenseLabel,
    ...inputs,
  };

  const prompt = fill(`${GLOBAL_PREAMBLE}\n\n${skill.prompt}`, values);
  let output: string;
  try {
    output = await claude("You are a helpful, compliant real estate AI. Follow the instructions exactly.", prompt, 2600);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The skill run failed." };
  }
  if (!output) return { ok: false, error: "No output was produced." };

  const gate = producesPublicContent(skill) ? await runComplianceGate(output, values) : null;
  return { ok: true, output, assignee, gate };
}
