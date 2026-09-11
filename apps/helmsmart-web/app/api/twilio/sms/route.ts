/**
 * Twilio SMS Webhook — POST /api/twilio/sms
 *
 * Configure in Twilio console:
 *   Messaging → Phone Number → "A message comes in" → Webhook → https://your-domain/api/twilio/sms
 *
 * Stores inbound SMS as a message in the inbox.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { cachedSystem, markTranscriptCached, readCacheUsage } from "@/lib/promptCache";
import { OPT_OUT_REASON, shouldStartMessaging, shouldStopMessaging } from "@helm/dna-communication";
import { checkConsent, clearSmsOptOut, recordSmsOptOut } from "@/lib/consent";
import { outcomeForLog, sendSmsGuarded } from "@/lib/outbound-send";
import type { MessageSender } from "@/lib/message-provenance";
import { createNotificationService } from "@/lib/notifications-service";
import { analyzeInbound, translateTo, localizeOutbound, intentLabel, replyLanguageRule, type Lang } from "@/lib/language";
import { orgWriteLocale } from "@/lib/i18n/userLocale";
import { contactLanguageFor } from "@/lib/i18n/contactLocale";
import { verifyTwilioSignature, formParams } from "@/lib/twilio-verify";
import { cancelAppointment, getUpcomingAppointment } from "@/lib/booking";
import { isAffirmative, isCancelRequest } from "@/lib/sms-intent";
import { notifyBooking } from "@/lib/receptionist-agent";
import { dispatchTool } from "@helm/ai-workforce";
import { createSmsReceptionistRegistry, type ToolTextResult } from "@/lib/workforce-tools";
import { enforceAutonomy } from "@/lib/workforce-gating";
import { logInboundSMSCommunication, logSMSCommunication } from "@/lib/integrations/communication-auto-logger";

// The SMS receptionist uses Sonnet for reliable multi-step tool-use (qualify →
// check_availability → book_appointment), same as the live-call path.
const SMS_BOOKING_MODEL = "claude-sonnet-4-6";

const SMS_TOOLS: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Find open appointment slots for an appointment type on a date. ALWAYS call this before offering or booking a time. Returns real openings only — never invent times.",
    input_schema: {
      type: "object",
      properties: {
        appointment_type: { type: "string", description: "The service/appointment type the customer wants." },
        date: { type: "string", description: "Date to check, formatted YYYY-MM-DD." },
      },
      required: ["appointment_type", "date"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book a specific open slot. Use only a `start` value returned by check_availability, after confirming the time and the customer's name.",
    input_schema: {
      type: "object",
      properties: {
        appointment_type: { type: "string" },
        start: { type: "string", description: "Exact ISO start time from check_availability." },
        caller_name: { type: "string", description: "The customer's name." },
      },
      required: ["appointment_type", "start", "caller_name"],
    },
  },
  {
    name: "create_callback",
    description:
      "Log a request for the team to call the customer back. Use when you can't help over text or they ask for a person.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why they want a callback / the message to pass on." },
        caller_name: { type: "string", description: "The customer's name, if given." },
      },
      required: ["reason"],
    },
  },
];

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params = formParams(formData);
  if (!verifyTwilioSignature(request, params)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const from = params.From ?? null;
  const to   = params.To   ?? null;
  const body = params.Body ?? null;
  const sid  = params.MessageSid ?? null;

  if (!from || !to || !body) {
    return new NextResponse("<?xml version=\"1.0\"?><Response/>", {
      headers: { "Content-Type": "text/xml" },
    });
  }

  const supabase = await createServiceClient();

  // Find org by Twilio number
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, auto_reply, auto_reply_msg, owner_english_assist")
    .eq("twilio_number", to)
    .single();

  if (org) {
    // Find client by phone number
    const { data: client } = await supabase
      .from("clients")
      .select("id, preferred_language")
      .eq("organization_id", org.id)
      .eq("phone", from)
      .maybeSingle();

    // Appointment self-service (CANCEL → confirm → YES) runs BEFORE the opt-out /
    // auto-reply branches so a customer's "cancel" manages their appointment (with
    // a YES confirmation) rather than unsubscribing them.
    if (client && (await handleAppointmentSelfService({ supabase, org, client, from, to, body }))) {
      return new NextResponse('<?xml version="1.0"?><Response/>', { headers: { "Content-Type": "text/xml" } });
    }

    // One Haiku call classifies language + intent + urgency together.
    const assist = !!org.owner_english_assist;
    // The owner's language: what a translation for them is written in.
    const ownerLang = contactLanguageFor(await orgWriteLocale(org.id, supabase));
    const analysis = await analyzeInbound(body);
    const lang: Lang = (client?.preferred_language as Lang | null) ?? analysis.lang;
    if (client && !client.preferred_language) {
      await supabase.from("clients").update({ preferred_language: lang }).eq("id", client.id);
    }
    // Translate an inbound the owner can't read into the language they can. The
    // column is still called translation_en; it holds the owner's language.
    const translationEn = assist && lang !== ownerLang ? await translateTo(body, ownerLang) : null;

    await supabase.from("messages").insert({
      organization_id: org.id,
      client_id: client?.id ?? null,
      channel: "sms",
      direction: "inbound",
      from_address: from,
      to_address: to,
      body,
      translation_en: translationEn,
      intent: analysis.intent,
      priority: analysis.priority,
      read: false,
      external_id: sid,
      sent_at: new Date().toISOString(),
    });

    /*
     * STOP is an instruction, not just a message. It used to be captured and
     * triaged like any other text and then forgotten — the next reminder,
     * campaign or Auto Pilot reply went out regardless. Now it is written down
     * on the client and in sms_unsubscribes, which every send path checks;
     * START (or UNSTOP) takes it back.
     */
    const optOutKeyword = shouldStopMessaging(body);
    const optInKeyword = !optOutKeyword && shouldStartMessaging(body);
    if (optOutKeyword) await recordSmsOptOut(supabase, org.id, from, OPT_OUT_REASON.stopReply);
    else if (optInKeyword) await clearSmsOptOut(supabase, org.id, from);

    // Log inbound SMS to communication timeline
    if (client?.id && body) {
      void logInboundSMSCommunication({
        clientId: client.id,
        phoneNumber: from,
        messageText: body,
        twilioSid: sid ?? "",
      });
    }

    // Triage: auto-create a task for messages that need the owner to act.
    if (analysis.priority === "high" || ["booking", "billing", "complaint"].includes(analysis.intent)) {
      await supabase.from("tasks").insert({
        organization_id: org.id,
        client_id: client?.id ?? null,
        title: `${intentLabel(analysis.intent)} from ${from} — reply needed`,
        notes: (translationEn || body).slice(0, 500),
        due_date: new Date().toISOString().slice(0, 10),
        priority: analysis.priority === "high" ? "high" : "normal",
        status: "open",
      });
    }

    // Notify the dashboard
    await createNotificationService(org.id, {
      type: "new_message",
      title: "New SMS received",
      // No body key: the message is what the customer texted, in their own
      // language. It is quoted, not translated.
      body: body.length > 80 ? body.slice(0, 77) + "…" : body,
      titleKey: "notifications.events.newSms",
      link: "/inbox",
    });

    // auto_pilot lives on clients (migration 00045). Read it best-effort so a
    // not-yet-migrated DB degrades to the canned auto-reply instead of erroring
    // the whole inbound flow.
    let clientAutoPilot = false;
    if (client) {
      const { data: ap } = await supabase
        .from("clients")
        .select("auto_pilot")
        .eq("id", client.id)
        .maybeSingle();
      clientAutoPilot = Boolean((ap as { auto_pilot?: boolean } | null)?.auto_pilot);
    }

    // A lead we recently auto-texted after a missed call (Phase 1) is in an active
    // booking conversation — let the AI receptionist qualify + book over SMS, not
    // just the manually-enabled auto_pilot clients.
    let missedCallLead = false;
    if (client) {
      const since = new Date(Date.now() - 48 * 3600_000).toISOString();
      const { count: leadCalls } = await supabase
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("client_id", client.id)
        .eq("auto_replied", true)
        .gt("called_at", since);
      missedCallLead = (leadCalls ?? 0) > 0;
    }

    // The AI receptionist (qualify + book over SMS) runs for auto_pilot clients and
    // recent missed-call leads; it takes precedence over the canned org auto-reply.
    // A STOP or START keyword gets no reply of ours: the carrier answers both
    // itself. Anything else still passes the consent guard inside each send.
    const isKeyword = optOutKeyword || optInKeyword;
    if (client && (clientAutoPilot || missedCallLead) && !isKeyword) {
      await runAutoPilotReply({
        supabase,
        orgId: org.id,
        orgName: org.name ?? "our business",
        clientId: client.id,
        from,
        to,
        lang,
        assist,
        ownerLang,
      });
    } else if (org.auto_reply && !isKeyword) {
      // Opt-out (STOP/unsubscribe/…): message is still captured + triaged, but no auto-reply (TCPA).
      const fourHoursAgo = new Date(Date.now() - 4 * 3600_000).toISOString();
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("direction", "outbound")
        .eq("to_address", from)
        .gt("sent_at", fourHoursAgo);
      if (!count) {
        const ackEnglish =
          org.auto_reply_msg?.trim() ||
          "Thanks for reaching out! We got your message and will get back to you shortly.";
        const ackBody = await localizeOutbound(ackEnglish, lang, assist ? ownerLang : null);
        const sent = await sendSmsGuarded({
          db: supabase,
          orgId: org.id,
          clientId: client?.id ?? null,
          to: from,
          body: ackBody,
          fromNumber: to,
          purpose: "automated",
          sentBy: "auto_reply",
        });
        // Refused (opted out of texts) or failed — the inbound is still
        // captured and the owner notified.
        if (!sent.ok) console.warn("[sms] auto-reply not sent:", outcomeForLog(sent));
      }
    }
  }

  // Respond with empty TwiML (any auto-reply is sent above via the REST API)
  return new NextResponse("<?xml version=\"1.0\"?><Response/>", {
    headers: { "Content-Type": "text/xml" },
  });
}

/**
 * Send an automatic SMS reply through the consent guard and log it to the
 * inbox, recording who sent it. Best-effort: a refusal or failure is logged,
 * never thrown into the webhook.
 */
async function sendSms(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  opts: {
    orgId: string;
    clientId: string | null;
    from: string;
    to: string;
    body: string;
    intent?: string;
    sentBy: MessageSender;
  },
): Promise<void> {
  const sent = await sendSmsGuarded({
    db: supabase,
    orgId: opts.orgId,
    clientId: opts.clientId,
    to: opts.to,
    body: opts.body,
    fromNumber: opts.from,
    purpose: "automated",
    sentBy: opts.sentBy,
    intent: opts.intent ?? null,
  });
  if (!sent.ok) {
    console.warn("[sms] reply not sent:", outcomeForLog(sent));
    return;
  }
  // Log outbound SMS to communication timeline
  if (opts.clientId) {
    void logSMSCommunication({
      clientId: opts.clientId,
      phoneNumber: opts.to,
      messageText: opts.body,
      twilioSid: sent.externalId ?? "",
    });
  }
}

/**
 * Appointment self-service over SMS. A customer texts CANCEL → we reply asking them
 * to confirm with YES (marking that outbound message intent="cancel_confirm") and
 * do NOT cancel yet. On the YES (within 30 min) we cancel their upcoming
 * appointment. Returns true when it fully handled the inbound (logged it + replied)
 * so the route stops processing — keeping "cancel" out of the opt-out path.
 */
async function handleAppointmentSelfService(args: {
  supabase: Awaited<ReturnType<typeof createServiceClient>>;
  org: { id: string; name: string | null };
  client: { id: string };
  from: string;
  to: string;
  body: string;
}): Promise<boolean> {
  const { supabase, org, client, from, to, body } = args;
  const orgName = org.name ?? "the team";

  // Did we recently ask this customer to confirm a cancellation?
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: pending } = await supabase
    .from("messages")
    .select("id")
    .eq("organization_id", org.id)
    .eq("client_id", client.id)
    .eq("direction", "outbound")
    .eq("intent", "cancel_confirm")
    .gt("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const logInbound = () =>
    supabase.from("messages").insert({
      organization_id: org.id, client_id: client.id, channel: "sms", direction: "inbound",
      from_address: from, to_address: to, body, read: false, sent_at: new Date().toISOString(),
    });

  // Step 1 — a cancel request with no pending confirmation: ask them to confirm.
  if (!pending && isCancelRequest(body)) {
    const appt = await getUpcomingAppointment(org.id, client.id);
    if (!appt) return false; // nothing to cancel → let the normal flow handle it
    await logInbound();
    const link = appt.rescheduleToken ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/reschedule/${appt.rescheduleToken}` : "";
    const prompt = `You're booked for ${appt.label}. Reply YES to cancel${link ? `, or reschedule here: ${link}` : ""}. — ${orgName}`;
    await sendSms(supabase, { orgId: org.id, clientId: client.id, from: to, to: from, body: prompt, intent: "cancel_confirm", sentBy: "auto_reply" });
    return true;
  }

  // Step 2 — they confirmed (YES / cancel again) after we asked: cancel it.
  if (pending && (isAffirmative(body) || isCancelRequest(body))) {
    await logInbound();
    const res = await cancelAppointment(org.id, { clientId: client.id });
    const reply = res.ok
      ? `Done — your appointment${res.label ? ` on ${res.label}` : ""} is cancelled. Text us anytime to rebook. — ${orgName}`
      : `We couldn't find an upcoming appointment to cancel — give us a call and we'll help. — ${orgName}`;
    await sendSms(supabase, { orgId: org.id, clientId: client.id, from: to, to: from, body: reply, sentBy: "auto_reply" });
    if (res.ok) {
      await createNotificationService(org.id, {
        type: "booking",
        title: "Appointment cancelled by customer",
        body: `${from}${res.label ? ` — was ${res.label}` : ""}`,
        titleKey: "notifications.events.appointmentCancelled",
        // With no label there is no sentence left to translate — just the
        // number — so that case carries no body key at all.
        bodyKey: res.label ? "notifications.events.appointmentCancelledBody" : undefined,
        params: { caller: from, when: res.label ?? "" },
        link: "/calendar",
      });
    }
    return true;
  }

  return false;
}

// Sonnet pricing (per million tokens): input $3, output $15, cache read $0.30,
// cache write $3.75. Used to estimate cost_cents for run accounting — not
// billed to customers.
//
// The cached rates are not a detail: a cached read is a TENTH of fresh input,
// so pricing reads at $3 would report a loop as costing roughly what it did
// before caching and hide the entire saving. This figure is one of the few
// places we can see what the AI actually costs, so it has to tell the truth.
function estimateCostCents(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  return Math.round(
    (inputTokens * 3 + outputTokens * 15 + cacheReadTokens * 0.3 + cacheWriteTokens * 3.75) /
      10_000,
  );
}

/**
 * HelmSmart AI Receptionist over SMS — now routed through the real workforce
 * engine (executeRun + ToolRegistry). Emma's autonomy level is enforced:
 *   autonomous       → full qualify-and-book loop runs inside a tracked run
 *   act_with_approval → queued for owner approval, run escalated
 *   suggest          → no auto-reply
 *
 * Falls back to the pre-engine (legacy) path if Emma isn't seeded/active for
 * this org yet, so existing tenants keep working without re-configuration.
 */
async function runAutoPilotReply(opts: {
  supabase: Awaited<ReturnType<typeof createServiceClient>>;
  orgId: string;
  orgName: string;
  clientId: string;
  from: string;
  to: string;
  lang: Lang;
  assist: boolean;
  ownerLang: Lang;
}) {
  const { supabase, orgId, orgName, clientId, from, to, lang, assist, ownerLang } = opts;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  // Don't spend an AI run composing a reply nobody may send. The send itself
  // is guarded too; this only saves the work.
  try {
    const { decision } = await checkConsent(supabase, orgId, { clientId, phone: from }, "sms", "automated");
    if (!decision.allowed) return;
  } catch (e) {
    console.error("[sms autopilot] consent lookup failed; not replying:", e);
    return;
  }

  // Circuit breaker: max 5 outbound SMS to this number in the last 10 minutes.
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("direction", "outbound")
    .eq("to_address", from)
    .gt("sent_at", tenMinAgo);
  if ((count ?? 0) >= 5) return;

  // Build conversation transcript for the LLM.
  const { data: recent } = await supabase
    .from("messages")
    .select("direction, body")
    .eq("organization_id", orgId)
    .eq("client_id", clientId)
    .eq("channel", "sms")
    .order("sent_at", { ascending: false })
    .limit(8);
  const transcript = (recent ?? [])
    .slice()
    .reverse()
    .map((m) => `${m.direction === "inbound" ? "Customer" : orgName}: ${m.body}`)
    .join("\n");

  const langRule = replyLanguageRule(lang, ownerLang, assist, "replies");
  const todayISO = new Intl.DateTimeFormat("en-CA").format(new Date());
  const system =
    `You are the receptionist for "${orgName}", helping a customer over SMS. Be warm and concise (under 320 characters) and ask ONE question at a time. ` +
    `Your goal is to understand what they need and book an appointment. Qualify briefly (what service, preferred day/time), then ALWAYS call check_availability before offering times, and book with book_appointment using an exact "start" it returned. ` +
    `Today is ${todayISO}. ${langRule} If you can't help over text or they ask for a person, use create_callback. Never invent availability. Return only the message text — no "[Name]" placeholder, no signature.`;

  // Tool registry built around this caller's phone number.
  const registry = createSmsReceptionistRegistry(from);

  // The agent loop — unchanged logic, but tool calls go through dispatchTool
  // (real ToolRegistry) instead of the hand-rolled runReceptionistTool.
  async function runAgentLoop(): Promise<{ replyText: string; bookedNote: string | null; bookedLabel: string | null; bookedRescheduleToken: string | null; tokensUsed: number; costCents: number }> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Conversation so far (most recent last):\n${transcript}\n\nWrite the next reply to the customer, booking an appointment when appropriate.`,
      },
    ];

    let replyText = "";
    let bookedNote: string | null = null;
    let bookedLabel: string | null = null;
    let bookedRescheduleToken: string | null = null;
    let totalInput = 0;
    let totalOutput = 0;
    // Tracked separately because they are priced differently — and because
    // `tokensUsed` must still describe the whole context, not just the part
    // that happened to miss the cache.
    let totalCacheRead = 0;
    let totalCacheWrite = 0;

    const anthropic = new Anthropic({ apiKey: apiKey! });
    for (let i = 0; i < 4; i++) {
      // Each round re-sends the system prompt, every SMS tool schema and the
      // whole conversation. Two breakpoints — one on the system prompt (which
      // covers the tool schemas, since the cached prefix runs tools -> system
      // -> messages) and one moved to the end of the transcript — let rounds
      // after the first read all of that from cache instead of re-buying it.
      markTranscriptCached(messages as never);
      const resp = await anthropic.messages.create({
        model: SMS_BOOKING_MODEL,
        max_tokens: 500,
        system: cachedSystem(system) as never,
        tools: SMS_TOOLS,
        messages,
      });
      const usage = readCacheUsage(resp.usage);
      totalInput += usage.uncached;
      totalCacheRead += usage.read;
      totalCacheWrite += usage.written;
      totalOutput += resp.usage.output_tokens;

      const textPart = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (textPart) replyText = textPart;

      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) break;

      messages.push({ role: "assistant", content: resp.content as Anthropic.ContentBlockParam[] });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        // dispatchTool routes through the real ToolRegistry — not the hand-rolled dispatcher.
        const out = await dispatchTool<ToolTextResult>(registry, tu.name, tu.input, {
          db: supabase,
          orgId,
          employeeId: "", // filled in by enforceAutonomy's run ctx; harmless empty here
          runId: undefined,
        });
        if (out.bookedEventId) {
          bookedNote = out.bookedNote ?? null;
          bookedLabel = out.bookedLabel ?? null;
          bookedRescheduleToken = out.bookedRescheduleToken ?? null;
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out.text });
      }
      messages.push({ role: "user", content: results });
    }

    return {
      replyText,
      bookedNote,
      bookedLabel,
      bookedRescheduleToken,
      tokensUsed: totalInput + totalCacheRead + totalCacheWrite + totalOutput,
      costCents: estimateCostCents(totalInput, totalOutput, totalCacheRead, totalCacheWrite),
    };
  }

  // Enforce Emma's autonomy level. If she isn't seeded/active, "no_employee"
  // falls through to the legacy path below, so nothing breaks for existing orgs.
  const gatingResult = await enforceAutonomy(supabase, orgId, "emma", {
    runInput: { channel: "sms", subjectType: "contact", subjectId: clientId },
    approvalSubject: { from, bodyPreview: transcript.slice(-200) },
    toolKey: "service.book_appointment",
    toolInput: { from, orgId },
    description: `Emma wants to qualify and book an appointment for ${from} over SMS.`,
    execute: async () => {
      const result = await runAgentLoop();
      // Side-effects after a successful run: send reply or confirmation.
      if (result.bookedNote) {
        await notifyBooking(supabase, { orgId, orgName, twilioNumber: to }, from, {
          bookedNote: result.bookedNote,
          bookedLabel: result.bookedLabel,
          rescheduleToken: result.bookedRescheduleToken,
        });
      } else {
        const replyText = result.replyText.replace(/^["']|["']$/g, "").trim();
        if (replyText) await sendSms(supabase, { orgId, clientId, from: to, to: from, body: replyText, sentBy: "auto_pilot" });
      }
      return {
        value: result.bookedNote,
        tokensUsed: result.tokensUsed,
        costCents: result.costCents,
        outcome: { from, booked: !!result.bookedNote },
      };
    },
  }).catch((e) => {
    console.error("[sms autopilot] gating error:", e);
    return { status: "no_employee" as const };
  });

  // Legacy fallback: if Emma isn't in the registry yet, run the loop directly
  // (no run accounting). This keeps existing tenants working without re-seeding.
  if (gatingResult.status === "no_employee") {
    try {
      const result = await runAgentLoop();
      if (result.bookedNote) {
        await notifyBooking(supabase, { orgId, orgName, twilioNumber: to }, from, {
          bookedNote: result.bookedNote,
          bookedLabel: result.bookedLabel,
          rescheduleToken: result.bookedRescheduleToken,
        });
      } else {
        const replyText = result.replyText.replace(/^["']|["']$/g, "").trim();
        if (replyText) await sendSms(supabase, { orgId, clientId, from: to, to: from, body: replyText, sentBy: "auto_pilot" });
      }
    } catch (e) {
      console.error("[sms autopilot] legacy loop error:", e);
    }
  }
}
