import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { sendOutboundSms } from "@/lib/ai-sms/outbound";
import { createTask } from "@/lib/crm/pipeline/tasks";
import { insertAgentInboxNotification } from "@/lib/notifications/agentNotifications";
import type { MarketingPlanStepRow } from "./types";

type ExecutionResult = {
  plansProcessed: number;
  stepsExecuted: number;
  stepsFailed: number;
  plansCompleted: number;
};

/**
 * Execute all due steps for active marketing plans.
 * Called by the daily cron job.
 *
 * A step is "due" when:
 *   plan.started_at + step.delay_days <= now
 *   AND step.status = "pending"
 *   AND step.enabled = true
 */
export async function executeActivePlans(): Promise<ExecutionResult> {
  const result: ExecutionResult = { plansProcessed: 0, stepsExecuted: 0, stepsFailed: 0, plansCompleted: 0 };

  // Get all active plans.
  const { data: plans } = await supabaseAdmin
    .from("marketing_plans")
    .select("id, agent_id, contact_id, started_at")
    .eq("status", "active");

  if (!plans?.length) return result;

  const now = new Date();

  for (const plan of plans) {
    const planId = String((plan as Record<string, unknown>).id);
    const agentId = String((plan as Record<string, unknown>).agent_id);
    const leadId = (plan as Record<string, unknown>).contact_id ? String((plan as Record<string, unknown>).contact_id) : null;
    const startedAt = new Date(String((plan as Record<string, unknown>).started_at ?? now.toISOString()));

    result.plansProcessed++;

    // Get pending, enabled steps for this plan.
    const { data: steps } = await supabaseAdmin
      .from("marketing_plan_steps")
      .select("*")
      .eq("plan_id", planId)
      .eq("status", "pending")
      .eq("enabled", true)
      .order("step_order", { ascending: true });

    if (!steps?.length) {
      // Check if all steps are done → mark plan completed.
      await checkAndCompletePlan(planId);
      continue;
    }

    for (const rawStep of steps) {
      const step = rawStep as unknown as MarketingPlanStepRow;
      const dueDate = new Date(startedAt.getTime() + step.delay_days * 86_400_000);

      if (dueDate > now) continue; // Not due yet.

      // Get lead data for execution.
      let leadEmail: string | null = null;
      let leadPhone: string | null = null;
      if (leadId) {
        const { data: lead } = await supabaseAdmin
          .from("contacts")
          .select("email, phone")
          .eq("id", leadId)
          .maybeSingle();
        if (lead) {
          leadEmail = String((lead as Record<string, unknown>).email ?? "");
          leadPhone = String((lead as Record<string, unknown>).phone ?? "");
        }
      }

      try {
        await executeStep(step, { agentId, leadId, leadEmail, leadPhone });
        await supabaseAdmin
          .from("marketing_plan_steps")
          .update({
            status: "executed",
            executed_at: new Date().toISOString(),
            execution_result: { success: true },
          } as Record<string, unknown>)
          .eq("id", step.id);
        result.stepsExecuted++;

        // Update last_contacted_at for communication steps.
        if (leadId && (step.action === "send_email" || step.action === "send_sms")) {
          try {
            await supabaseAdmin
              .from("contacts")
              .update({ last_contacted_at: new Date().toISOString() } as Record<string, unknown>)
              .eq("id", leadId);
          } catch { /* best-effort */ }
        }

        // Log to lead_events for CRM visibility.
        if (leadId) {
          await supabaseAdmin.from("contact_events").insert({
            contact_id: leadId as unknown as number,
            agent_id: agentId as unknown as number,
            event_type: "marketing_plan_step",
            metadata: { plan_id: planId, step_id: step.id, action: step.action, channel: step.channel },
          } as Record<string, unknown>);
        }

        // CloseBoss activity feed — running plans is the Marketing
        // Assistant's work (fire-and-forget, never fails the step).
        void (async () => {
          const { logAssistantActivity } = await import("@/lib/closeboss/activities");
          void logAssistantActivity({
            agentId,
            assistantType: "marketing_assistant",
            activityType: "marketing_plan_step",
            summary: `Ran a marketing plan step (${step.action.replace(/_/g, " ")})`,
            outcome: step.channel ? `via ${step.channel}` : null,
            requiresAttention: false,
            relatedEntityType: leadId ? "contact" : null,
            relatedEntityId: leadId,
          });
        })();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        await supabaseAdmin
          .from("marketing_plan_steps")
          .update({
            status: "failed",
            executed_at: new Date().toISOString(),
            execution_result: { success: false, error: msg },
          } as Record<string, unknown>)
          .eq("id", step.id);
        result.stepsFailed++;
        console.warn(`marketing step ${step.id} failed:`, msg);
      }
    }

    // Check if plan is now complete.
    const completed = await checkAndCompletePlan(planId);
    if (completed) result.plansCompleted++;
  }

  return result;
}

async function executeStep(
  step: MarketingPlanStepRow,
  ctx: { agentId: string; leadId: string | null; leadEmail: string | null; leadPhone: string | null }
): Promise<void> {
  switch (step.action) {
    case "send_email":
      if (!ctx.leadEmail) throw new Error("No email for lead");
      await sendEmail({
        to: ctx.leadEmail,
        subject: step.subject ?? "Message from your agent",
        text: step.body,
      });
      break;

    case "send_sms":
      if (!ctx.leadId || !ctx.leadPhone) throw new Error("No phone for lead");
      await sendOutboundSms({
        leadId: ctx.leadId,
        to: ctx.leadPhone,
        body: step.body,
        agentId: ctx.agentId,
        actorType: "system",
        actorName: "Marketing Plan",
      });
      break;

    case "create_task":
      await createTask({
        agentId: ctx.agentId,
        leadId: ctx.leadId,
        title: step.body.slice(0, 200),
        description: step.body,
        priority: "normal",
        dueAt: new Date(Date.now() + 86_400_000).toISOString(), // Due tomorrow
        source: "automation",
        aiRationale: "Generated by marketing plan",
      });
      break;

    case "send_notification":
      await insertAgentInboxNotification({
        agentId: ctx.agentId,
        type: "reminder",
        priority: "medium",
        title: "Marketing plan reminder",
        body: step.body,
        deepLink: {
          screen: "lead",
          leadId: ctx.leadId ?? undefined,
        },
      });
      break;

    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}

/**
 * Check if all steps in a plan are done (executed, skipped, or failed) and mark complete.
 */
async function checkAndCompletePlan(planId: string): Promise<boolean> {
  const { count: pending } = await supabaseAdmin
    .from("marketing_plan_steps")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId)
    .eq("enabled", true)
    .in("status", ["pending", "scheduled"]);

  if ((pending ?? 0) === 0) {
    await supabaseAdmin
      .from("marketing_plans")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId)
      .eq("status", "active");
    return true;
  }
  return false;
}
