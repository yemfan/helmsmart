import "server-only";

import { getAnthropicClient } from "@/lib/anthropic";
import { languageDirectiveForJson } from "@/lib/i18n/languageDirective";
import type { AgentGrowthSnapshot, GrowthOpportunity } from "./opportunityTypes";

/**
 * Turns an AgentGrowthSnapshot into 3-5 actionable growth opportunities
 * via Claude. Pure function aside from the API call — caller handles
 * caching + persistence.
 *
 * Prompt design:
 *   * System prompt: real-estate growth coach persona. Bias toward
 *     concrete, data-backed actions over generic "post more on social."
 *   * User content: compact JSON of the snapshot. No raw rows; the
 *     gatherer already aggregated down to the salient signals.
 *   * Return strict JSON array — same tolerant parser trick as the
 *     contract extractor (strip fences, then JSON.parse).
 *
 * Why Sonnet 4.6 not Opus: this is a structured-output task on a small
 * input. Sonnet is fast + cheap + good enough. Switch to Opus later if
 * recommendation quality is lacking.
 */

const SYSTEM_PROMPT = `You are a real-estate business coach analyzing one agent's CRM + pipeline data to surface 3-5 concrete growth opportunities.

Your job:
- Read the JSON snapshot of their last 90 days of activity.
- Pick the 3-5 HIGHEST-leverage actions they could take TODAY to grow revenue or close gaps.
- Each opportunity must be specific, data-backed, and have a clear next step the agent can execute inside the LeadSmart AI product.

Principles:
- Favor signals the agent can fix this week over vague long-term strategy.
- Reference specific numbers / names from the data — "3 hot leads haven't heard from you in 10+ days" beats "follow up with hot leads."
- Never invent contact names or properties. Only use names + facts literally present in the snapshot.
- If there's nothing urgent (all metrics healthy), return 1-2 "keep momentum" cards rather than forced complaints.

Opportunity categories (pick the most fitting, never invent new ones):
- stale_sphere              — past clients / warm contacts going cold
- cold_hot_lead             — agent-rated hot leads with no recent outreach
- would_offer_idle          — showing feedback flagged would_offer but no offer logged
- stalled_offer             — active offer sitting untouched
- pipeline_gap              — not enough active deals / activity in the funnel
- source_concentration      — all leads from one source; diversification risk
- close_rate                — low offer-acceptance rate; strategy insight
- anniversary_reach_out     — past-close clients due for anniversary messaging
- other                     — only when nothing else fits

Action URLs (use these literal patterns — the UI resolves them):
- /dashboard/contacts?list=leads            — jump to lead list
- /dashboard/contacts?list=sphere           — jump to sphere list
- /dashboard/contacts/{id}                  — a specific contact (use ONLY an id from the data)
- /dashboard/showings/{id}                  — a specific showing
- /dashboard/offers/{id}                    — a specific offer
- /dashboard/offers/new?contactId={id}      — pre-filled offer form
- /dashboard/showings?contactId={id}        — buyer's showing list
- /dashboard/performance                    — revenue dashboard
- null                                      — if no single target makes sense`;

const SCHEMA_INSTRUCTION = `Return JSON with this exact shape:

{
  "opportunities": [
    {
      "id": "string",                  // short slug; lowercase with dashes
      "priority": "high" | "medium" | "low",
      "category": "stale_sphere" | "cold_hot_lead" | "would_offer_idle" | "stalled_offer" | "pipeline_gap" | "source_concentration" | "close_rate" | "anniversary_reach_out" | "other",
      "title": "string",               // ≤70 chars, action-first
      "insight": "string",             // 1-2 sentences
      "action": "string",              // 1 imperative sentence
      "actionUrl": "string" | null,    // deep link per the patterns above
      "actionLabel": "string" | null,  // button label, ≤20 chars
      "context": [ "string" ]          // up to 3 short chips (names, numbers)
    }
  ]
}

Return ONLY that JSON. No prose, no markdown, no code fences. At most 5 opportunities.`;

/**
 * @param locale The language the AGENT reads, from `agentUiLocale()`. These
 *   opportunities are coaching notes for them, not client-facing copy.
 */
export async function generateOpportunities(
  snapshot: AgentGrowthSnapshot,
  locale?: string | null,
): Promise<GrowthOpportunity[]> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT + languageDirectiveForJson(locale),
    messages: [
      {
        role: "user",
        content: `Here is the agent's 90-day activity snapshot:\n\n${JSON.stringify(snapshot, null, 2)}\n\n${SCHEMA_INSTRUCTION}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Opportunity generator returned no text");
  }
  return parseOpportunitiesResponse(textBlock.text);
}

/**
 * Tolerant parser — strips code fences, validates shape, drops any
 * malformed items rather than failing the whole run. Exported for
 * unit-testing without hitting Claude.
 */
export function parseOpportunitiesResponse(raw: string): GrowthOpportunity[] {
  const stripped = stripFences(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new Error(
      `Opportunity generator did not return valid JSON: ${raw.slice(0, 200)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Opportunity response was not an object");
  }
  const arr = (parsed as { opportunities?: unknown[] }).opportunities;
  if (!Array.isArray(arr)) return [];

  const out: GrowthOpportunity[] = [];
  for (const raw of arr) {
    const o = coerceOpportunity(raw);
    if (o) out.push(o);
    if (out.length >= 5) break;
  }
  return out;
}

const VALID_CATEGORIES: GrowthOpportunity["category"][] = [
  "stale_sphere",
  "cold_hot_lead",
  "would_offer_idle",
  "stalled_offer",
  "pipeline_gap",
  "source_concentration",
  "close_rate",
  "anniversary_reach_out",
  "other",
];

const VALID_PRIORITIES: GrowthOpportunity["priority"][] = ["high", "medium", "low"];

function coerceOpportunity(raw: unknown): GrowthOpportunity | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const title = asString(r.title);
  const action = asString(r.action);
  const insight = asString(r.insight);
  if (!title || !action || !insight) return null;

  const category = VALID_CATEGORIES.includes(r.category as GrowthOpportunity["category"])
    ? (r.category as GrowthOpportunity["category"])
    : "other";
  const priority = VALID_PRIORITIES.includes(r.priority as GrowthOpportunity["priority"])
    ? (r.priority as GrowthOpportunity["priority"])
    : "medium";

  return {
    id: asString(r.id) || `opp-${Math.random().toString(36).slice(2, 8)}`,
    priority,
    category,
    title: truncate(title, 100),
    insight: truncate(insight, 300),
    action: truncate(action, 200),
    actionUrl: asNullableString(r.actionUrl) ?? null,
    actionLabel: asNullableString(r.actionLabel) ?? null,
    context: asStringArray(r.context).slice(0, 3),
  };
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1] : s;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asNullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string" && x.trim().length > 0) as string[];
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
