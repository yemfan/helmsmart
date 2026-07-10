import type { BossAssignee } from "@/lib/realtyboss/actions/registry";

/**
 * Stateful, multi-phase AI-team engagements — see the `playbook_runs` table.
 * A run persists a LIVING plan (`plan_json`) that the optimize step rewrites,
 * plus an append-only list of produced deliverables (`artifacts_json`).
 */

export type PlaybookRunType = "house_selling" | "house_buying";
export type PlaybookRunStatus = "active" | "paused" | "completed" | "cancelled";

/** One AI-generated property ad variant (distinct from the standard listing post). */
export type PropertyAd = {
  angle: string;
  audience: string;
  headline: string;
  primaryText: string;
  cta: string;
};

/** A produced deliverable, appended to artifacts_json as phases complete. */
export type PlaybookArtifact = {
  kind: "marketing_plan" | "property_ads" | "cma" | "saved_search" | "search_plan" | "task_set";
  title: string;
  url: string | null;
  createdAt: string;
};

/** Living selling plan — rewritten by the optimize step. */
export type SellingPlan = {
  marketingPlan?: string;
  ads?: PropertyAd[];
  channels?: string[];
  lastOptimizedAt?: string;
  optimizeNotes?: string[];
};

/** Living buying plan — rewritten by the optimize step. */
export type BuyingPlan = {
  criteria?: string;
  frequency?: "daily" | "weekly" | null;
  channel?: string;
  savedSearchId?: string;
  matchCount?: number;
  lastOptimizedAt?: string;
  optimizeNotes?: string[];
};

export type PlaybookRunRow = {
  id: string;
  agent_id: string;
  type: PlaybookRunType;
  contact_id: string | null;
  property_address: string | null;
  title: string;
  phase: string;
  status: PlaybookRunStatus;
  plan_json: SellingPlan | BuyingPlan | Record<string, unknown>;
  artifacts_json: PlaybookArtifact[];
  next_review_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaybookPhaseKind = "checklist" | "generate" | "execute" | "optimize";

export type PlaybookPhaseDef = {
  key: string;
  kind: PlaybookPhaseKind;
  title: string;
  assignee: BossAssignee;
  description: string;
};

export type PlaybookRunDef = {
  type: PlaybookRunType;
  title: string;
  /** One line telling the agent when this playbook starts. */
  trigger: string;
  phases: PlaybookPhaseDef[];
};
