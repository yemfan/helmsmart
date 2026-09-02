import { sendEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEmailMessage } from "./lead-resolution";

export async function sendOutboundEmail(params: {
  leadId: string;
  to: string;
  subject: string;
  body: string;
  agentId?: string | null;
  actorType?: "agent" | "system" | "ai";
  actorName?: string | null;
  /** When false, only persist to CRM (no Resend). */
  deliver?: boolean;
  /**
   * Optional HTML body. Text is still required — it is what gets stored on the
   * thread, and a mail client without HTML still needs something to show.
   */
  html?: string;
  /**
   * Extra SMTP headers, e.g. the RFC 8058 List-Unsubscribe pair on marketing
   * mail. Present so a contact-facing sender never has to drop to `sendEmail`
   * to get them — bypassing this helper is what left sent mail out of the
   * Inbox three separate times.
   */
  headers?: Record<string, string>;
}) {
  const deliver = params.deliver !== false;
  let externalId: string | null = null;
  let delivered = false;

  if (deliver && process.env.RESEND_API_KEY?.trim()) {
    // Let the error propagate so callers know the message was not sent.
    const result = await sendEmail({
      to: params.to.trim(),
      subject: params.subject,
      text: params.body,
      ...(params.html ? { html: params.html } : {}),
      ...(params.headers && Object.keys(params.headers).length > 0
        ? { headers: params.headers }
        : {}),
    });
    externalId = result?.id ? String(result.id) : null;
    delivered = true;
  }

  await logEmailMessage({
    leadId: params.leadId,
    direction: "outbound",
    subject: params.subject,
    body: params.body,
    agentId: params.agentId ?? null,
    externalMessageId: externalId,
  });

  try {
    await supabaseAdmin.from("message_logs").insert({
      contact_id: params.leadId,
      type: "email",
      status: delivered ? "sent" : "queued",
      content: `${params.subject}\n\n${params.body}`,
    } as Record<string, unknown>);
  } catch {
    // optional
  }

  try {
    await supabaseAdmin.rpc("log_lead_event", {
      p_contact_id: params.leadId,
      p_event_type: "email_sent",
      p_metadata: {
        to: params.to,
        subject: params.subject,
        externalMessageId: externalId,
        actorType: params.actorType ?? "system",
        actorName: params.actorName ?? null,
        delivered,
      },
    });
  } catch {
    // optional
  }

  // Update last_contacted_at on the lead.
  try {
    await supabaseAdmin
      .from("contacts")
      .update({ last_contacted_at: new Date().toISOString() } as Record<string, unknown>)
      .eq("id", params.leadId);
  } catch {
    // optional column
  }

  // Bump last_activity_at + auto-complete any open inactive-lead
  // follow-up tasks for this contact. The agent is doing the
  // follow-up right now — the to-do is stale.
  if (params.agentId) {
    try {
      const { markContactActivity } = await import("@/lib/contacts/activity");
      await markContactActivity(params.agentId, params.leadId);
    } catch {
      // best-effort housekeeping
    }
  }

  return { success: true as const, delivered, externalMessageId: externalId };
}
