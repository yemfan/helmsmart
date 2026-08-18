import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAssistantActivity } from "@/lib/closeboss/activities";
import { defineTool } from "../types";

/**
 * hand_off_to_agent — Max's safe escape hatch for anything he should NOT do
 * himself (capability-map "handle beyond predefined").
 *
 * The Boss v2 loop already lets Max reason about novel/variant requests and ask
 * clarifying questions in plain text (steered by the system prompt). This tool
 * is the DURABLE action for the remaining cases: the request needs the realtor
 * personally, is out of scope, stayed unclear, or hits a capability the team
 * doesn't have yet. It logs a task for the realtor AND records the category —
 * `capability_gap` / `unclear` are the data-driven signal for what to build or
 * clarify next. Honest handoff beats a faked result.
 */
export const handOffToAgent = defineTool({
  name: "hand_off_to_agent",
  description:
    "Hand a request back to the realtor when you should NOT act on it yourself: it needs them personally (moving money, signing, account/billing/security changes), it is genuinely out of scope, it stayed unclear even after you asked, or the team has no capability for it yet. Logs a clear task for them with the reason and a next step — never invent a result or pretend a tool exists instead. Prefer first acting when you can, or asking ONE clarifying question; use this only when a handoff is genuinely the right move.",
  inputSchema: z.object({
    summary: z.string().min(3).describe("What the realtor asked / what needs doing, in one line."),
    why: z.string().min(3).describe("Why this needs the realtor rather than the team."),
    category: z
      .enum(["needs_action", "out_of_scope", "unclear", "capability_gap"])
      .describe(
        "needs_action = only the realtor can do it (funds, signing, account/security); out_of_scope = not something CloseBoss does; unclear = couldn't pin down intent; capability_gap = the team should be able to do this but has no tool yet.",
      ),
    suggested_next_step: z.string().optional().describe("A concrete next step for the realtor, if you have one."),
  }),
  riskClass: "crm_write",
  assignee: "receptionist",
  execute: async (ctx, input) => {
    const description = [input.why, input.suggested_next_step ? `Next step: ${input.suggested_next_step}` : null]
      .filter(Boolean)
      .join("\n\n");

    // A task the realtor sees in their queue.
    await supabaseAdmin.from("crm_tasks").insert({
      agent_id: ctx.agentId,
      title: input.summary.slice(0, 200),
      description: description || null,
      status: "open",
      priority: "medium",
      source: "automation",
      task_type: "boss_handoff",
      metadata_json: { from: "boss_handoff", category: input.category },
    });

    // Learning signal: capability_gap / unclear handoffs tell us what to build
    // or clarify next. Surfaced in the assistant-activity feed, flagged for you.
    await logAssistantActivity({
      agentId: ctx.agentId,
      assistantType: "boss_assistant",
      activityType: `handoff_${input.category}`,
      summary: input.summary.slice(0, 200),
      outcome: input.why.slice(0, 300),
      requiresAttention: true,
    }).catch(() => {});

    const label =
      input.category === "capability_gap"
        ? "logged for the team to build"
        : input.category === "out_of_scope"
          ? "flagged as out of scope"
          : input.category === "unclear"
            ? "flagged for a clarification"
            : "handed to you to action";
    return {
      status: "completed",
      summary: `Handed to you — ${label}: ${input.summary}`,
      data: { category: input.category },
    };
  },
});
