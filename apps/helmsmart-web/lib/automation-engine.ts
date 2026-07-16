/**
 * Automation Engine — plain module, NOT a Server Action.
 * Import and call runAutomations() from server actions or route handlers.
 * Errors in individual rules are swallowed so callers always succeed.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AutomationTrigger =
  | "invoice_overdue"
  | "invoice_paid"
  | "new_lead"
  | "campaign_sent";

export interface AutomationContext {
  orgId: string;
  clientId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  amount?: number | null;
  campaignId?: string | null;
  campaignName?: string | null;
}

// ─── Template interpolation ───────────────────────────────────────────────────

function tpl(template: string, ctx: AutomationContext): string {
  return template
    .replace(/\{\{client_name\}\}/g, ctx.clientName ?? "the client")
    .replace(/\{\{invoice_number\}\}/g, ctx.invoiceNumber ?? "")
    .replace(
      /\{\{amount\}\}/g,
      ctx.amount != null ? `$${Number(ctx.amount).toFixed(2)}` : ""
    )
    .replace(/\{\{campaign_name\}\}/g, ctx.campaignName ?? "");
}

// ─── Rule executor ────────────────────────────────────────────────────────────

type Db = Awaited<ReturnType<typeof createServiceClient>>;

async function executeRule(
  rule: { id: string; action: string; config: Record<string, unknown> },
  ctx: AutomationContext,
  db: Db
): Promise<void> {
  const cfg = rule.config;

  switch (rule.action) {
    case "create_task": {
      const title = tpl(
        (cfg.title as string | undefined) ?? "Follow up with {{client_name}}",
        ctx
      );
      const offsetDays = Math.max(0, Number(cfg.due_offset_days ?? 1));
      const dueDate = new Date(Date.now() + offsetDays * 86_400_000)
        .toISOString()
        .slice(0, 10);

      await db.from("tasks").insert({
        organization_id: ctx.orgId,
        title,
        due_date: dueDate,
        client_id: ctx.clientId ?? null,
        priority: "normal",
        status: "open",
      });
      break;
    }

    case "send_email": {
      if (!ctx.clientEmail) break;

      const subject = tpl(
        (cfg.email_subject as string | undefined) ?? "A message from us",
        ctx
      );
      const body = tpl((cfg.email_body as string | undefined) ?? "", ctx);
      const { data: orgRow } = await db
        .from("organizations")
        .select("name")
        .eq("id", ctx.orgId)
        .single();
      const orgName = (orgRow as { name?: string } | null)?.name ?? "HelmSmart";

      await sendEmail({
        fromName: orgName,
        to: ctx.clientEmail,
        subject,
        text: body,
        html: `<div style="font-family:-apple-system,sans-serif;font-size:14px;color:#334155;line-height:1.6">${body.replace(/\n/g, "<br>")}</div>`,
      });
      break;
    }

    case "add_note": {
      if (!ctx.clientId) break;

      const noteBody = tpl(
        (cfg.note_body as string | undefined) ?? "Automated note",
        ctx
      );

      await db.from("client_notes").insert({
        organization_id: ctx.orgId,
        client_id: ctx.clientId,
        body: noteBody,
        kind: "note",
        author_id: null,
      });
      break;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Finds all enabled automation rules for the given trigger + org and executes them.
 * Never throws — individual rule errors are logged and skipped.
 */
export async function runAutomations(
  trigger: AutomationTrigger,
  ctx: AutomationContext,
  serviceDb?: Awaited<ReturnType<typeof createServiceClient>>
): Promise<void> {
  try {
    // serviceDb lets cron jobs pass the iterated pack client; callers in a
    // request context omit it and get the host-resolved client.
    const db = serviceDb ?? await createServiceClient();

    const { data: rules } = await db
      .from("automation_rules")
      .select("id, action, config, run_count")
      .eq("organization_id", ctx.orgId)
      .eq("enabled", true)
      .eq("trigger", trigger);

    if (!rules?.length) return;

    for (const rule of rules as {
      id: string;
      action: string;
      config: Record<string, unknown>;
      run_count: number;
    }[]) {
      try {
        await executeRule(rule, ctx, db);
        await db
          .from("automation_rules")
          .update({
            run_count: rule.run_count + 1,
            last_run_at: new Date().toISOString(),
          })
          .eq("id", rule.id);
      } catch (err) {
        console.error(`[automations] rule ${rule.id} (${trigger}) failed:`, err);
      }
    }
  } catch (err) {
    console.error("[automations] runAutomations error:", err);
  }
}
