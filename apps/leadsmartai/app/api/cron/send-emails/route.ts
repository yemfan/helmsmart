import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/email";
import {
  emailSuppression,
  unsubscribeHeaders,
  withUnsubscribeFooter,
} from "@/lib/email/unsubscribe";
import { logEmailMessage } from "@/lib/ai-email/lead-resolution";
import { sendSMS } from "@/lib/twilioSms";

export const runtime = "nodejs";

// contacts.id is a uuid since the contacts consolidation. lead_sequences.lead_id
// is text and legacy rows may hold pre-consolidation numeric ids that no longer
// resolve to any contact.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function addDays(base: Date, days: number) {
  const d = new Date(base.toISOString());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function parseCity(address: string | null) {
  const s = String(address ?? "");
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  // Common format: "123 Main St, Austin, TX" => city is parts[1]
  return parts.length >= 2 ? parts[1] : null;
}

function formatHomeValue(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

function normalizeUsPhoneToE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = digitsOnly(String(phone));
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length >= 12 && String(d).startsWith("0") === false) return `+${d}`;
  return null;
}

export async function GET(req: Request) {
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

    // Sending limits per lead (best-effort).
    const sendingLimitPerHour = 10;

    const { data: sequences, error: seqErr } = await supabaseServer
      .from("lead_sequences")
      .select("id,lead_id,current_step,next_send_at,status,created_at")
      .eq("status", "active")
      .lte("next_send_at", nowIso)
      .limit(100);

    if (seqErr) throw seqErr;

    let sent = 0;
    let skipped = 0;

    for (const seq of (sequences ?? []) as any[]) {
      const sequenceId = String(seq.id);
      const leadId = String(seq.lead_id ?? "").trim();
      if (!UUID_RE.test(leadId)) {
        // Pre-consolidation sequence keyed by a dropped bigint lead id (or
        // junk). It can never resolve to a contact again; retire it so it
        // stops being re-selected every run.
        await supabaseServer.from("lead_sequences").update({ status: "completed" }).eq("id", sequenceId);
        skipped++;
        continue;
      }

      // Stop automation if we've already recorded a reply for this lead.
      const { data: repliedRows } = await supabaseServer
        .from("message_logs")
        .select("id")
        .eq("contact_id", leadId)
        .eq("status", "replied")
        .limit(1);

      if ((repliedRows ?? []).length) {
        await supabaseServer.from("lead_sequences").update({ status: "completed" }).eq("id", sequenceId);
        await supabaseServer
          .from("contacts")
          .update({ automation_disabled: true } as any)
          .eq("id", leadId);
        continue;
      }

      // Sending limit guard.
      const { count } = await supabaseServer
        .from("message_logs")
        .select("id", { count: "exact", head: true } as any)
        .eq("contact_id", leadId)
        .gte("created_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString());
      const sentLastHour = Number(count ?? 0);
      if (sentLastHour >= sendingLimitPerHour) {
        await supabaseServer
          .from("lead_sequences")
          .update({ next_send_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString() })
          .eq("id", sequenceId);
        skipped++;
        continue;
      }

      const { data: lead, error: leadErr } = await supabaseServer
        .from("contacts")
        .select(
          "id,name,email,phone,sms_opt_in,contact_opt_out_email,do_not_contact_email,email_unsubscribe_token,agent_id,property_address,lead_type,source,created_at,report_id"
        )
        .eq("id", leadId)
        .maybeSingle();
      if (leadErr) throw leadErr;
      if (!lead) continue;

      const leadTypeRaw = String(lead.lead_type ?? "").toLowerCase();
      const inferredLeadType = leadTypeRaw === "buyer" || leadTypeRaw === "refinance" ? "buyer" : "seller";

      const { data: stepRows, error: stepErr } = await supabaseServer
        .from("sequence_steps")
        .select("id,day_offset,channel,sent,template_id,template:template_id(template_text)")
        .eq("sequence_id", sequenceId)
        .eq("sent", false)
        .order("day_offset", { ascending: true })
        .limit(1);
      if (stepErr) throw stepErr;

      const step = (stepRows ?? [])[0];
      if (!step) {
        await supabaseServer
          .from("lead_sequences")
          .update({ status: "completed" })
          .eq("id", sequenceId);
        await supabaseServer
          .from("contacts")
          .update({ automation_disabled: false } as any)
          .eq("id", leadId);
        continue;
      }

      const channel = String(step.channel).toLowerCase(); // email | sms
      const templateNode: any = (step as any).template ?? {};
      const templateTextRaw = Array.isArray(templateNode)
        ? templateNode[0]?.template_text
        : templateNode?.template_text;
      const templateText = String(templateTextRaw ?? "");
      const name = String(lead.name ?? String(lead.email ?? "").split("@")[0] ?? "there");
      const city = parseCity(lead.property_address);

      // Best-effort home_value from report_data.
      let homeValue = "—";
      try {
        const reportId = (lead as any).report_id;
        if (reportId) {
          const { data: reportRow } = await supabaseServer
            .from("reports")
            .select("report_data")
            .eq("id", reportId)
            .maybeSingle();
          const v =
            (reportRow as any)?.report_data?.estimated?.estimatedValue ??
            (reportRow as any)?.report_data?.estimatedValue ??
            null;
          homeValue = formatHomeValue(v);
        }
      } catch {}

      // Agent name: best-effort fallback.
      let agentName = "your agent";
      try {
        const agentId = lead.agent_id ? String(lead.agent_id) : null;
        if (agentId) {
          const { data: agentRow } = await supabaseServer
            .from("agents")
            .select("auth_user_id")
            .eq("id", agentId)
            .maybeSingle();
          const authUserId = (agentRow as any)?.auth_user_id;
          if (authUserId) {
            const { data: profileRow } = await supabaseServer
              .from("user_profiles")
              .select("full_name")
              .eq("user_id", authUserId)
              .maybeSingle();
            agentName = String((profileRow as any)?.full_name ?? "").trim() || agentName;
            if (!agentName) agentName = "your agent";
          }
        }
      } catch {}

      const rendered = templateText
        .replaceAll("{name}", name)
        .replaceAll("{city}", city ?? "")
        .replaceAll("{home_value}", homeValue)
        .replaceAll("{agent_name}", agentName);

      // Sending step.
      let emailMessageLogIdToCleanup: string | null = null;
      try {
        if (channel === "email") {
          if (!lead.email) {
            skipped++;
            // Do not mark the step as sent; try again later if email becomes available.
            continue;
          }

          // Create message log before sending so tracking URLs can reference it.
          const { data: logRow, error: logErr } = await supabaseServer
            .from("message_logs")
            .insert({
              contact_id: leadId,
              type: "email",
              status: "sent",
            })
            .select("id")
            .single();
          if (logErr) throw logErr;

          const messageLogId = String((logRow as any)?.id ?? "");
          if (!messageLogId) throw new Error("message_log_id missing");
          emailMessageLogIdToCleanup = messageLogId;

          const reportId = (lead as any).report_id ?? null;
          const reportLink = reportId
            ? `${origin}/report/${encodeURIComponent(String(reportId))}?lead_id=${encodeURIComponent(String(lead.id))}`
            : null;

          const trackedReportLink =
            reportLink
              ? `${origin}/api/track/click?lead_id=${encodeURIComponent(String(lead.id))}&message_log_id=${encodeURIComponent(
                  messageLogId
                )}&url=${encodeURIComponent(reportLink)}`
              : reportLink;

          const pixelUrl = `${origin}/api/track/email-open?lead_id=${encodeURIComponent(
            String(lead.id)
          )}&message_log_id=${encodeURIComponent(messageLogId)}`;

          const subject =
            inferredLeadType === "buyer" ? "Quick mortgage follow-up" : "Quick home value follow-up";

          const text = rendered;

          const html = `<div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; font-size: 14px; color: #0f172a;">
  <p style="white-space: pre-wrap;">${rendered.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>
  <div style="margin-top:12px;">
    ${
      trackedReportLink
        ? `<a href="${trackedReportLink}" style="color:#1d4ed8;font-weight:600;">View your report</a>`
        : ""
    }
  </div>
  <img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;" />
</div>`;

          // The email counterpart of the SMS consent gate below. This branch
          // used to send unconditionally — automated marketing, with an
          // open-tracking pixel, to anyone in the sequence — while the SMS
          // branch fifteen lines down refused to send without `sms_opt_in`.
          // Both suppression flags bind: the contact's own opt-out and the
          // agent's do-not-contact. Same shape as the SMS skip, including
          // advancing the sequence, so a suppressed contact quietly falls out
          // of the rail instead of being retried forever.
          const suppressed = emailSuppression(lead as Parameters<typeof emailSuppression>[0]);
          if (suppressed) {
            console.info("[send-emails] suppressed", { contactId: leadId, reason: suppressed });
          } else {
            const token = (lead as { email_unsubscribe_token?: string | null })
              .email_unsubscribe_token;
            // The footer carries the visible way out and the postal address;
            // the headers give Gmail and Outlook their native one-click button.
            // The header alone is not enough — it is invisible to the reader,
            // and someone who cannot find a way out clicks "spam" instead,
            // which costs every app sending from this domain.
            const withFooter = withUnsubscribeFooter({
              html,
              text,
              token,
              senderName: agentName,
            });

            const sent = await sendEmail({
              to: String(lead.email),
              subject,
              text: withFooter.text,
              html: withFooter.html,
              headers: unsubscribeHeaders(token),
            });

            // Thread it into the Inbox. The Inbox reads `email_messages`; this
            // loop only ever wrote `message_logs`, so every drip email the
            // system has sent was invisible there while SMS threaded fine —
            // the Twilio webhook writes `sms_messages` in both directions.
            //
            // Best-effort on purpose: the mail is already delivered by this
            // point, and failing the run over a logging insert would strand the
            // sequence and re-send on the next tick.
            try {
              await logEmailMessage({
                leadId: leadId,
                direction: "outbound",
                subject,
                // The stored copy is the words the agent wrote, without the
                // compliance footer or the tracking pixel — a thread should
                // read like the conversation, not the envelope.
                body: rendered,
                // `agentId` above is scoped to the agent-name try block; read
                // it off the contact row instead.
                agentId: lead.agent_id ? String(lead.agent_id) : null,
                externalMessageId: sent?.id ? String(sent.id) : null,
              });
            } catch (e) {
              console.warn("[send-emails] inbox log failed", {
                contactId: leadId,
                error: e instanceof Error ? e.message : e,
              });
            }
          }
        } else if (channel === "sms") {
          const smsOptIn = Boolean((lead as any).sms_opt_in);
          const leadPhone = String(lead.phone ?? "").trim();
          const toE164 = normalizeUsPhoneToE164(leadPhone);

          // Do not send SMS without consent.
          if (!smsOptIn || !toE164) {
            // Skip sending but still advance the sequence.
          } else {
            // Limit SMS frequency per lead (best-effort): max 1 SMS per 2 hours.
            const { count } = await supabaseServer
              .from("message_logs")
              .select("id", { count: "exact", head: true } as any)
              .eq("contact_id", leadId)
              .eq("type", "sms")
              .in("status", ["sent", "received", "replied"])
              .gte("created_at", new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString());

            const sentRecently = Number(count ?? 0);
            if (sentRecently < 1) {
              await sendSMS(toE164, rendered, leadId);
            }
            // If frequency limit hit, we skip sending but still advance the sequence.
          }
        }

        // Update last_contacted_at on the lead.
        try {
          await supabaseServer
            .from("contacts")
            .update({ last_contacted_at: new Date().toISOString() } as Record<string, unknown>)
            .eq("id", leadId);
        } catch { /* best-effort */ }

        // Mark the step as sent and advance.
        await supabaseServer
          .from("sequence_steps")
          .update({ sent: true })
          .eq("id", String(step.id));

        // Find next step to compute next_send_at.
        const { data: nextSteps } = await supabaseServer
          .from("sequence_steps")
          .select("day_offset")
          .eq("sequence_id", sequenceId)
          .eq("sent", false)
          .order("day_offset", { ascending: true })
          .limit(1);

        const nextStep = (nextSteps ?? [])[0];
        if (nextStep?.day_offset != null) {
          const nextAt = addDays(new Date(String(lead.created_at)), Number(nextStep.day_offset));
          await supabaseServer
            .from("lead_sequences")
            .update({
              current_step: Number(seq.current_step ?? 0) + 1,
              next_send_at: nextAt.toISOString(),
            })
            .eq("id", sequenceId);

          await supabaseServer
            .from("contacts")
            .update({ next_contact_at: nextAt.toISOString() } as any)
            .eq("id", leadId);
        } else {
          await supabaseServer
            .from("lead_sequences")
            .update({ status: "completed", next_send_at: nowIso })
            .eq("id", sequenceId);

          await supabaseServer
            .from("contacts")
            .update({ automation_disabled: false, next_contact_at: nowIso } as any)
            .eq("id", leadId);
        }

        sent++;
      } catch (e) {
        skipped++;
        // If sending fails, do not mark the step as sent; retry on the next cron run.
        // For email, delete the message log so we don't count/track a failed attempt.
        if (emailMessageLogIdToCleanup) {
          try {
            await supabaseServer.from("message_logs").delete().eq("id", emailMessageLogIdToCleanup);
          } catch {}
        }
      }
    }

    return NextResponse.json({ ok: true, processed: (sequences ?? []).length, sent, skipped });
  } catch (e: any) {
    console.error("GET /api/cron/send-emails error", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}

