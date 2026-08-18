import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAssistantActivity } from "@/lib/closeboss/activities";
import { sendEmail } from "@/lib/email";
import { defineTool } from "../types";

/**
 * report_bug — when the realtor reports a problem with CloseBoss ITSELF (the
 * app is broken/wrong/erroring), Max files it two ways:
 *   1. a `bug_reports` ticket — the engineering queue drained by the scheduled
 *      Claude Code triage/fix agent (investigate -> confirm -> open a PR).
 *   2. a `crm_tasks` support ticket — so it's tracked and the realtor gets
 *      acknowledgment that a human/support path exists too.
 *
 * Product defects only — real-estate tasks are other tools; things the realtor
 * must do themselves go through hand_off_to_agent.
 */
export const reportBug = defineTool({
  name: "report_bug",
  description:
    "Log a problem the realtor reports about CloseBoss ITSELF — the app (NOT a real-estate task): something is broken, erroring, wrong, missing, or not working. Capture what they were doing, what went wrong, and where in the app. Files it for engineering AND opens a support ticket so it's tracked and acknowledged. Use ONLY for product defects.",
  inputSchema: z.object({
    title: z.string().min(3).describe("Short one-line summary of the problem."),
    description: z.string().min(3).describe("What happened — steps, what they expected vs. what they saw, any error text."),
    page: z.string().optional().describe("Where in the app it happened, if known (page/feature)."),
    severity: z.enum(["low", "normal", "high"]).optional().describe("high = blocks work / data wrong; normal = default; low = cosmetic."),
  }),
  riskClass: "crm_write",
  assignee: "receptionist",
  execute: async (ctx, input) => {
    const severity = input.severity ?? "normal";

    // 1) Engineering queue (the scheduled fixer drains this).
    const { data: bug, error } = await supabaseAdmin
      .from("bug_reports")
      .insert({
        agent_id: ctx.agentId,
        title: input.title.slice(0, 200),
        description: input.description,
        page_context: input.page ?? null,
        severity,
        source: "ask_max",
        status: "new",
      })
      .select("id")
      .single();
    if (error) return { status: "failed", error: `Couldn't log the bug: ${error.message}` };
    const bugId = (bug as { id: string }).id;
    const ref = bugId.slice(0, 8);

    // 2) Support ticket the realtor can track (surfaces in Tasks).
    await supabaseAdmin
      .from("crm_tasks")
      .insert({
        agent_id: ctx.agentId,
        title: `Support: ${input.title}`.slice(0, 200),
        description:
          `Reported issue: ${input.description}` +
          (input.page ? `\n\nWhere: ${input.page}` : "") +
          `\n\nLogged with the team for a fix (ref ${ref}). Support is tracking this.`,
        status: "open",
        priority: severity === "high" ? "high" : "medium",
        source: "automation",
        task_type: "support_ticket",
        metadata_json: { from: "report_bug", bug_id: bugId, severity },
      })
      .then(() => undefined, () => undefined);

    // 3) Notify the support team by email (best-effort). SUPPORT_EMAIL overrides
    // the on-brand default; sends from the verified closebossai.com sender.
    const supportTo = process.env.SUPPORT_EMAIL?.trim() || "support@closebossai.com";
    await sendEmail({
      to: supportTo,
      subject: `[Bug · ${severity}] ${input.title}`.slice(0, 120),
      text:
        `A bug was reported via Ask Max.\n\n` +
        `Ref: ${ref}\nSeverity: ${severity}\nAgent ID: ${ctx.agentId}\n` +
        (input.page ? `Where: ${input.page}\n` : "") +
        `\nSummary: ${input.title}\n\nDetails:\n${input.description}\n`,
    }).catch(() => {});

    await logAssistantActivity({
      agentId: ctx.agentId,
      assistantType: "boss_assistant",
      activityType: "bug_reported",
      summary: `Bug reported: ${input.title}`.slice(0, 200),
      outcome: `severity ${severity}; ref ${ref}`,
      requiresAttention: severity === "high",
    }).catch(() => {});

    return {
      status: "completed",
      summary: `Logged it, opened a support ticket, and emailed the support team — we're on it (ref ${ref}). Thanks for flagging it.`,
      data: { bugId, ref, severity },
    };
  },
});
