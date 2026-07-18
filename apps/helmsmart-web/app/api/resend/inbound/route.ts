/**
 * Resend Inbound Email Webhook — POST /api/resend/inbound
 *
 * Setup:
 *   1. Configure a receiving (inbound) domain in Resend (e.g. inbound.smbai.app)
 *      and add the MX record Resend gives you at your DNS.
 *   2. Add a webhook in Resend → event "email.received" → URL
 *      https://your-domain/api/resend/inbound, then copy the signing secret into
 *      RESEND_INBOUND_WEBHOOK_SECRET.
 *   3. Set INBOUND_EMAIL_DOMAIN to that receiving domain.
 *   4. Each org auto-forwards their mailbox to {slug}@<INBOUND_EMAIL_DOMAIN>.
 *
 * The email.received event carries metadata only — the body is fetched from the
 * Received Emails API (GET /emails/receiving/{id}).
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { sendEmail, FROM_ADDRESS } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/server";
import { createNotificationService } from "@/lib/actions/notifications";
import { analyzeInbound, translateToEnglish, localizeOutbound, intentLabel, type Lang } from "@/lib/language";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY ?? "");

const ok = () => NextResponse.json({});

/** Pull a bare address out of "Name <email@x>" or "email@x". */
function extractEmail(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim().toLowerCase();
}

/** Automated/no-reply senders we must never auto-acknowledge (avoids loops). */
function isNoReplySender(email: string): boolean {
  return /(no-?reply|do-?not-?reply|mailer-daemon|postmaster|forwarding-noreply|bounce)/i.test(email);
}

/** Minimal HTML→text fallback when an email has no plain-text part. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ReceivedEvent {
  type?: string;
  data?: {
    // Resend exposes the inbound id as `id`; some docs call it `email_id`.
    id?: string;
    email_id?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    subject?: string | null;
    // Body arrives inline on the inbound event; the API is a fallback.
    text?: string;
    html?: string;
    created_at?: string;
  };
}

export async function POST(request: NextRequest) {
  const raw = await request.text();

  // Verify the Svix-signed webhook when a secret is configured.
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (secret) {
    if (typeof resend.webhooks?.verify !== "function") {
      console.error(
        "[resend/inbound] RESEND_INBOUND_WEBHOOK_SECRET is set but this resend SDK has no webhooks.verify — upgrade resend or unset the secret."
      );
      return new NextResponse("Verification unavailable", { status: 500 });
    }
    try {
      await resend.webhooks.verify({
        payload: raw,
        headers: {
          id: request.headers.get("svix-id") ?? "",
          timestamp: request.headers.get("svix-timestamp") ?? "",
          signature: request.headers.get("svix-signature") ?? "",
        },
        webhookSecret: secret,
      });
    } catch {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  let event: ReceivedEvent;
  try {
    event = JSON.parse(raw) as ReceivedEvent;
  } catch {
    return ok();
  }

  if (event.type !== "email.received") return ok();
  const data = event.data ?? {};
  const emailId = data.id ?? data.email_id;
  if (!emailId) return ok();

  // Route to an org: the recipient on our inbound domain; slug = local part.
  const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN?.toLowerCase();
  const recipients = [...(data.to ?? []), ...(data.cc ?? [])].map(extractEmail);
  const inboundAddr = inboundDomain
    ? recipients.find((a) => a.endsWith(`@${inboundDomain}`))
    : recipients[0];
  const slug = inboundAddr ? inboundAddr.split("@")[0] : null;
  if (!slug) return ok();

  const supabase = await createServiceClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, auto_reply, auto_reply_msg, owner_english_assist")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) return ok();

  // Resend's inbound event carries text/html inline; fall back to the
  // Received Emails API only if both are absent.
  let body = data.text?.trim() || (data.html ? htmlToText(data.html) : "");
  if (!body) {
    try {
      const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (res.ok) {
        const full = (await res.json()) as { text?: string; html?: string };
        body = full.text?.trim() || (full.html ? htmlToText(full.html) : "");
      }
    } catch {
      // leave body empty on fetch failure
    }
  }

  const senderEmail = data.from ? extractEmail(data.from) : "";

  // Match a client by sender email within the org (null if unknown).
  const { data: client } = senderEmail
    ? await supabase
        .from("clients")
        .select("id, preferred_language")
        .eq("organization_id", org.id)
        .eq("email", senderEmail)
        .maybeSingle()
    : { data: null };

  // One Haiku call classifies language + intent + urgency together.
  const assist = !!org.owner_english_assist;
  const analysis = await analyzeInbound(body);
  const lang: Lang = (client?.preferred_language as Lang | null) ?? analysis.lang;
  if (client && !client.preferred_language) {
    await supabase.from("clients").update({ preferred_language: lang }).eq("id", client.id);
  }
  // Translate a non-English inbound to English so the owner can read it.
  const translationEn = assist && lang !== "en" && body ? await translateToEnglish(body) : null;

  await supabase.from("messages").insert({
    organization_id: org.id,
    client_id: client?.id ?? null,
    channel: "email",
    direction: "inbound",
    from_address: senderEmail,
    to_address: inboundAddr,
    subject: data.subject ?? null,
    body: body || "(no content)",
    translation_en: translationEn,
    intent: analysis.intent,
    priority: analysis.priority,
    read: false,
    external_id: emailId,
    sent_at: data.created_at ?? new Date().toISOString(),
  });

  // Triage: auto-create a task for messages that need the owner to act.
  if (analysis.priority === "high" || ["booking", "billing", "complaint"].includes(analysis.intent)) {
    await supabase.from("tasks").insert({
      organization_id: org.id,
      client_id: client?.id ?? null,
      title: `${intentLabel(analysis.intent)} from ${senderEmail || "email"} — reply needed`,
      notes: (translationEn || body || "").slice(0, 500),
      due_date: new Date().toISOString().slice(0, 10),
      priority: analysis.priority === "high" ? "high" : "normal",
      status: "open",
    });
  }

  await createNotificationService(org.id, {
    type: "new_message",
    title: "New email received",
    body: (body || data.subject || "").slice(0, 80),
    link: "/inbox",
  });

  // Instant auto-acknowledge so a new lead never sits unanswered. Skips automated
  // senders (e.g. Gmail's forwarding confirmation) and is rate-limited to once
  // per ~4h per sender so an active thread isn't repeatedly auto-replied.
  if (org.auto_reply && senderEmail && !isNoReplySender(senderEmail)) {
    const fourHoursAgo = new Date(Date.now() - 4 * 3600_000).toISOString();
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("direction", "outbound")
      .eq("to_address", senderEmail)
      .gt("sent_at", fourHoursAgo);
    if (!count) {
      const ackEnglish =
        org.auto_reply_msg?.trim() ||
        "Thanks for reaching out! We got your message and will get back to you shortly.";
      const ackBody = await localizeOutbound(ackEnglish, lang, assist);
      const fromEmail = FROM_ADDRESS;
      const ackSubject = data.subject ? `Re: ${data.subject}` : "We received your message";
      try {
        // Throws if Resend rejects the ack, so the outbound row below isn't
        // written for mail that never left — a phantom row would also
        // suppress retries via the 4h rate-limit check above.
        await sendEmail({ to: senderEmail, subject: ackSubject, text: ackBody });
        await supabase.from("messages").insert({
          organization_id: org.id,
          client_id: client?.id ?? null,
          channel: "email",
          direction: "outbound",
          from_address: fromEmail,
          to_address: senderEmail,
          subject: ackSubject,
          body: ackBody,
          read: true,
          sent_at: new Date().toISOString(),
        });
      } catch {
        // ack failed — inbound is still captured + owner notified
      }
    }
  }

  return ok();
}
