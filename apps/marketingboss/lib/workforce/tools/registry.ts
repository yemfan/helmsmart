import "server-only";

import type { WorkforceTool } from "./types";
import { getBusinessProfileTool, researchBusiness } from "./impl/research";
import { findTrends, listViralLibrary, listOpportunities } from "./impl/trends";
import { planContent, createPlaybook } from "./impl/strategy";
import { draftPostTool, generateMedia } from "./impl/create";
import { schedulePost, publishPost } from "./impl/distribute";
import { getPerformance, getLearnings } from "./impl/measure";

/**
 * The workforce tool catalog (3.0 Phase 0).
 *
 * Adding a capability = one tool module + one entry here. Nina's agent loop
 * (Phase 1) reads this catalog; the executor enforces the rails regardless of
 * what is registered.
 *
 * NOT registered, deliberately:
 *  - UGC / character video (lib/ai.ts draftUgcAd, Character Studio) — the
 *    wizard is a guided, multi-step flow with its own preview and cost
 *    confirmation. Handing a 35-credit render to an autonomous loop before the
 *    approval UI exists is the wrong order.
 *  - Weekly schedule edits — a standing commitment the owner set by hand;
 *    changing it needs an approval surface first.
 *  - Community outreach (lib/communityIntelligence.ts) — posting into other
 *    people's communities is a reputation action, not a publish action.
 */
// Tool inputs are intentionally heterogeneous; the registry only needs the
// common shape, and each tool re-validates its own input in parseInput.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALL_TOOLS: WorkforceTool<any>[] = [
  // Oliver — research
  getBusinessProfileTool,
  researchBusiness,
  // Ruby — discovery
  listOpportunities,
  listViralLibrary,
  findTrends,
  // Max — strategy
  planContent,
  createPlaybook,
  // Chris / Leo — creation
  draftPostTool,
  generateMedia,
  // Emma — distribution
  schedulePost,
  publishPost,
  // Grace — measurement
  getPerformance,
  getLearnings,
];

const BY_NAME = new Map<string, WorkforceTool<unknown>>(
  ALL_TOOLS.map((t) => [t.name, t as WorkforceTool<unknown>]),
);

export function getWorkforceTool(name: string): WorkforceTool<unknown> | null {
  return BY_NAME.get(name) ?? null;
}

export function listWorkforceTools(): WorkforceTool<unknown>[] {
  return [...ALL_TOOLS] as WorkforceTool<unknown>[];
}

/** The catalog in Anthropic tool-call shape. Schemas are hand-written, so they pass straight through. */
export function toolsForModel(
  toolSet: WorkforceTool<unknown>[] = listWorkforceTools(),
): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return toolSet.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
}
