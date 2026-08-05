import "server-only";

import { z } from "zod";
import { defineTool } from "../types";
import { routeSkillRequest, runSkillAndSave } from "@/lib/realtyboss/skills/run";
import { getSkill, ASSIGNEE_LABEL } from "@/lib/realtyboss/skills/catalog";

/**
 * run_skill — the agent's Realtor AI skills library (~59 skills) as one tool.
 *
 * The skills catalog covers the long tail of writing/content/analysis work that
 * doesn't have a dedicated tool: listing descriptions, farm/expired/FSBO
 * scripts, objection scripts, nurture sequences, buyer consultation packets,
 * market reports, net sheets, GCI plans, newsletters, case studies, video
 * scripts, and more. This tool routes the realtor's request to ONE enabled
 * skill, fills its inputs, runs it (with the Fair-Housing + advertising
 * compliance gate for public content), and saves a viewable run.
 *
 * Use it for a writing/content/analysis ask that ISN'T one of the specific
 * tools (CMA, seller presentation, house search, deep report, social post,
 * avatar video, messaging, tasks, calendar). The real employee who owns the
 * chosen skill is named in the result.
 */
export const runSkill = defineTool({
  name: "run_skill",
  description:
    "Run one of the realtor's ~59 Realtor AI skills — write or analyze content that has no dedicated tool: listing descriptions, farm/circle-prospecting and expired/FSBO scripts, objection scripts, nurture/drip sequences, buyer consultation packets, market reports, net sheets, GCI/business plans, newsletters, case studies, video scripts, and more. Choose this for a writing/content/analysis request that is NOT already covered by run_cma, generate_seller_presentation, house_search, generate_deep_report, publish_social_post, create_avatar_video, draft_message, create_task, or create_calendar_event. Pass the realtor's full request verbatim; the team picks the right skill and fills its inputs.",
  inputSchema: z.object({
    request: z
      .string()
      .min(3)
      .describe("The realtor's full request, verbatim — what they want written or analyzed."),
  }),
  riskClass: "draft",
  // Static owner for autopilot lookup only; run_skill is non-outbound, so this
  // never gates a send. The REAL employee is resolved per skill and named in
  // the summary.
  assignee: "sales_assistant",
  execute: async (ctx, input) => {
    const route = await routeSkillRequest(ctx.agentId, input.request);
    if (route.skillId === null) {
      return { status: "failed", error: route.reason };
    }
    const res = await runSkillAndSave(ctx.agentId, route.skillId, route.inputs);
    if (!res.ok) {
      return { status: "failed", error: res.error };
    }
    const title = getSkill(route.skillId)?.title ?? "skill";
    const gateNote = res.gate
      ? res.gate.status === "flag"
        ? " — compliance flagged, review before use"
        : " — compliance passed"
      : "";
    return {
      status: "completed",
      summary: `${ASSIGNEE_LABEL[res.assignee]} ran "${title}"${gateNote}.`,
      artifactUrl: `/dashboard/skills/runs/${res.runId}`,
      data: { skillId: route.skillId, gate: res.gate?.status ?? null },
    };
  },
});
