import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createCmaForAgent, isCreateCmaFailure } from "@/lib/cma/service";
import { generateDeepReport } from "@/lib/deep-report/service";
import { getFeatureQuota, incrementFeatureUsage } from "@/lib/quota/featureQuota";
import { BOSS_ACTIONS } from "@/lib/closeboss/actions/registry";
import { defineTool } from "../types";

/** agents.auth_user_id — CMA quota + presentation ownership key off the user. */
async function resolveUserId(agentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .maybeSingle();
  return (data as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;
}

export const runCma = defineTool({
  name: "run_cma",
  description:
    "Generate a comparative market analysis (CMA) / home valuation with live comps for a property address. Use for any value estimate, comps request, or pricing question. Counts against the agent's daily CMA quota.",
  inputSchema: z.object({
    address: z.string().min(5).describe("Full property address"),
    contact_id: z.string().uuid().optional().describe("CRM contact to attach the CMA to"),
  }),
  riskClass: "research",
  assignee: "sales_assistant",
  execute: async (ctx, input) => {
    const userId = await resolveUserId(ctx.agentId);
    if (!userId) return { status: "failed", error: "Couldn't resolve the agent's user account." };
    const res = await createCmaForAgent({
      userId,
      agentId: ctx.agentId,
      subjectAddress: input.address,
      contactId: input.contact_id ?? null,
    });
    if (isCreateCmaFailure(res)) return { status: "failed", error: res.error };
    return {
      status: "completed",
      summary: `CMA ready for ${input.address}`,
      display: { key: "reports.cmaReady", params: { address: input.address } },
      artifactUrl: `/dashboard/cma/${res.cma.id}`,
      data: { cma_id: res.cma.id },
    };
  },
});

export const generateSellerPresentation = defineTool({
  name: "generate_seller_presentation",
  description:
    "Build a full AI seller/listing presentation (pricing strategy, comps, market insights, neighborhood, schools, agent profile) for a property address. Reuses a recent CMA when one exists.",
  inputSchema: z.object({
    address: z.string().min(5).describe("Full property address"),
    contact_id: z.string().uuid().optional().describe("Seller contact this is for (context only)"),
  }),
  riskClass: "draft",
  assignee: "sales_assistant",
  execute: async (ctx, input) => {
    // Single source of truth: the Boss action's run() already orchestrates
    // CMA-snapshot reuse → AI sections → persistence. Wrap, don't duplicate.
    const res = await BOSS_ACTIONS.generate_seller_presentation.run({
      agentId: ctx.agentId,
      params: { address: input.address },
      autoExecute: true, // no outbound channel — flag is unused by this action
    });
    if (res.status !== "completed") return { status: "failed", error: res.note };
    return {
      status: "completed",
      summary: res.note,
      artifactUrl: res.artifactUrl,
    };
  },
});

export const generateDeepReportTool = defineTool({
  name: "generate_deep_report",
  description:
    "Generate a deep property report (valuation, deal rating, rent estimate, affordability, investment returns, schools, neighborhood) for an address. Use when a buyer or investor needs the full picture beyond a CMA. Counts against the agent's daily Deep Report quota.",
  inputSchema: z.object({
    address: z.string().min(5).describe("Full property address"),
    property_use: z
      .enum(["primary", "second_home", "investment"])
      .default("primary")
      .describe("How the buyer intends to use the property"),
    contact_id: z.string().uuid().optional().describe("CRM contact this is for (context only)"),
  }),
  riskClass: "research",
  assignee: "sales_assistant",
  execute: async (ctx, input) => {
    // Delegates to the sales assistant's action so the quota, the persistence
    // and the link are defined once. The dashboard route is a third caller of
    // the same policy; whenever these drifted, one of them was the stale one.
    const res = await BOSS_ACTIONS.generate_deep_report.run({
      agentId: ctx.agentId,
      params: { address: input.address, property_use: input.property_use },
      autoExecute: true,
    });
    if (res.status !== "completed") return { status: "failed", error: res.note };
    return {
      status: "completed",
      summary: res.note,
      display: { key: "reports.deepReportReady", params: { address: input.address } },
      // The agent's own copy â /deep-report/<id> asks who you are and serves
      // only your own reports. Not something to hand a client.
      artifactUrl: res.artifactUrl,
    };
  },
});
