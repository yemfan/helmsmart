import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCmaForAgent, isCreateCmaFailure } from "@/lib/cma/service";
import { createPresentation } from "@/lib/listing-presentations/service";

/**
 * Boss Assistant ACTION REGISTRY.
 *
 * Each action declares (a) which assistant owns it, (b) the parameters it
 * REQUIRES — so when the Realtor's instruction is missing one (e.g. an open
 * house with no address), the Boss asks a follow-up question instead of
 * silently doing nothing — and (c) a `run()` that calls the real capability
 * already in the app and returns a viewable artifact.
 *
 * Adding a capability = adding one entry here (+ a line in the planner's
 * action catalog). The executor (./execute.ts) and the Boss card are generic.
 */

export type BossActionType = "generate_cma" | "generate_seller_presentation";

export type ActionParamDef = {
  key: string;
  label: string;
  /** Follow-up question the Boss asks when this param is missing. */
  question: string;
};

type RunCtx = { agentId: string; params: Record<string, string> };

export type RunResult =
  | { status: "completed"; artifactType: string; artifactUrl: string; note: string }
  | { status: "assigned"; note: string };

export type BossAssignee =
  | "receptionist"
  | "sales_assistant"
  | "marketing_assistant"
  | "transaction_assistant"
  | "accountant";

export type BossActionDef = {
  type: BossActionType;
  assignee: BossAssignee;
  label: string;
  /** Tells the planner what this action does + when to choose it. */
  planHint: string;
  requiredParams: ActionParamDef[];
  run: (ctx: RunCtx) => Promise<RunResult>;
};

async function resolveUserId(agentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .maybeSingle();
  return (data as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;
}

export const BOSS_ACTIONS: Record<BossActionType, BossActionDef> = {
  generate_cma: {
    type: "generate_cma",
    assignee: "sales_assistant",
    label: "AI CMA",
    planHint:
      "generate_cma — produce a comparative market analysis (CMA) / home valuation with live comps for a property. Choose when the Realtor asks for a CMA, comps, a value or price estimate, or \"what's it worth\". params: { address }.",
    requiredParams: [
      { key: "address", label: "property address", question: "What's the full property address for the CMA?" },
    ],
    run: async ({ agentId, params }) => {
      const userId = await resolveUserId(agentId);
      if (!userId) {
        return { status: "assigned", note: "Couldn't resolve your account to run the CMA." };
      }
      const res = await createCmaForAgent({ userId, agentId, subjectAddress: params.address });
      if (isCreateCmaFailure(res)) {
        return { status: "assigned", note: res.error };
      }
      return {
        status: "completed",
        artifactType: "cma",
        artifactUrl: `/dashboard/cma/${res.cma.id}`,
        note: `CMA ready for ${params.address}`,
      };
    },
  },

  generate_seller_presentation: {
    type: "generate_seller_presentation",
    assignee: "sales_assistant",
    label: "Seller Presentation",
    planHint:
      "generate_seller_presentation — start a branded listing/seller presentation for a property. Choose when the Realtor asks for a listing presentation or seller presentation. params: { address }.",
    requiredParams: [
      {
        key: "address",
        label: "property address",
        question: "What's the property address for the seller presentation?",
      },
    ],
    run: async ({ agentId, params }) => {
      await createPresentation({ agentId, propertyAddress: params.address });
      return {
        status: "completed",
        artifactType: "presentation",
        artifactUrl: "/dashboard/presentations",
        note: `Seller presentation started for ${params.address}`,
      };
    },
  },
};

export function isBossActionType(v: unknown): v is BossActionType {
  return v === "generate_cma" || v === "generate_seller_presentation";
}

/** Required params still missing from `params`. */
export function missingParams(
  type: BossActionType,
  params: Record<string, unknown>,
): ActionParamDef[] {
  return BOSS_ACTIONS[type].requiredParams.filter((p) => {
    const v = params[p.key];
    return !(typeof v === "string" && v.trim().length > 0);
  });
}

/** The combined follow-up question for any missing params, or null when ready. */
export function followUpQuestion(
  type: BossActionType,
  params: Record<string, unknown>,
): string | null {
  const missing = missingParams(type, params);
  if (missing.length === 0) return null;
  return missing.map((p) => p.question).join(" ");
}

/** The catalog block injected into the planner's system prompt. */
export function actionCatalogPrompt(): string {
  return Object.values(BOSS_ACTIONS)
    .map((a) => `- ${a.planHint}`)
    .join("\n");
}
