/**
 * Retell call webhook — POST /api/retell/webhook
 *
 * Retell calls this on call_started / call_ended / call_analyzed with the full
 * call object. We upsert a voice_sessions row keyed by call_sid so every call —
 * inbound or outbound, booking or not — is logged with the caller's number,
 * linked to a contact, and (on analysis) its summary + transcript + recording.
 *
 * On call_ended for an inbound call we also run the missed-call text-back: if the
 * caller hung up on the AI, hit voicemail, or the call errored, we auto-text them
 * so the lead isn't lost (logged to `calls`, which the Missed-Call UI reads).
 *
 * Set the agent's Webhook URL to the canonical www host so Retell's POST isn't
 * lost to the apex->www redirect, and include ?k=<RETELL_FUNCTION_SECRET> so the
 * SMS-sending side of this webhook can't be triggered by forged call events:
 *   https://www.helmsmart.ai/api/retell/webhook?k=<RETELL_FUNCTION_SECRET>
 */

import { NextRequest, NextResponse, after } from "next/server";
import twilio from "twilio";
import { createServiceClient } from "@/lib/supabase/server";
import { findOrgIdByNumber } from "@/lib/receptionist-agent";
import { matchOrCreateClient } from "@/lib/booking";
import { normalizePhoneE164 } from "@/lib/phone";
import { twilioSender } from "@/lib/twilio-sender";
import { attributeCallToEmma } from "@/lib/workforce-attribution";
import { createNotificationService } from "@/lib/actions/notifications";
import { classifyMissed } from "@/lib/missed-call";
import { logCallCommunication } from "@/lib/integrations/communication-auto-logger";
import { notifySlackMissedCall } from "@/lib/integrations/slack";
import { twilioStatusCallback } from "@/lib/twilio-sender";

type TranscriptTurn = { role?: string; content?: string };
type Db = Awaited<ReturnType<typeof createServiceClient>>;

/** Spoken-friendly US phone, e.g. "+16267557917" -> "(626) 755-7917". */
function formatPhone(e164: string): string {
  const d = (e164 || "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return e164 || "the caller";
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Create a follow-up task for the owner after an inbound AI call. Idempotent —
 * skips when a task already references this call (so a re-delivered call_analyzed
 * won't double-task). Best-effort; the caller swallows errors.
 */
async function createInboundFollowUpTask(
  db: Db,
  args: { orgId: string; clientId: string; callId: string; summary: string; fromNumber: string },
): Promise<void> {
  const { data: dup } = await db
    .from("tasks")
    .select("id")
    .eq("organization_id", args.orgId)
    .ilike("notes", `%${args.callId}%`)
    .maybeSingle();
  if (dup) return;

  // Use the contact's name when it isn't the "Caller" placeholder; else the number.
  let who = formatPhone(args.fromNumber);
  const { data: client } = await db
    .from("clients")
    .select("first_name,last_name")
    .eq("id", args.clientId)
    .maybeSingle();
  const fn = (client?.first_name ?? "").trim();
  const ln = (client?.last_name ?? "").trim();
  if (fn && fn.toLowerCase() !== "caller") who = ln ? `${fn} ${ln}` : fn;

  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await db.from("tasks").insert({
    organization_id: args.orgId,
    title: `Follow up: AI call from ${who}`,
    notes: `${args.summary}\n\n(Ref: ${args.callId})`,
    due_date: dueDate,
    client_id: args.clientId,
    priority: "high",
    status: "open",
  });
}

/**
 * Auto-text a caller the AI receptionist couldn't serve, so the lead isn't lost.
 * Best-effort: every failure is swallowed so a hiccup never breaks the webhook.
 *
 * Idempotent + de-duped: one `calls` row per call_sid (the UNIQUE constraint wins
 * a race between re-delivered webhooks), and we skip the send if this caller was
 * already texted in the last 4 hours (repeat calls from the same number).
 */
async function maybeTextBackMissedCall(
  db: Db,
  args: {
    orgId: string;
    callId: string;
    fromNumber: string; // caller
    toNumber: string; // business number (Twilio "from" when we reply)
    clientId: string | null;
    disconnectionReason: string;
    userTurns: number;
  },
): Promise<void> {
  try {
    const caller = normalizePhoneE164(args.fromNumber);
    if (!caller.ok || !args.toNumber || args.toNumber === "unknown") return;

    const verdict = classifyMissed(args);
    if (!verdict) return;

    const { data: org } = await db
      .from("organizations")
      .select("auto_reply, auto_reply_msg")
      .eq("id", args.orgId)
      .maybeSingle();
    if (!org?.auto_reply || !org.auto_reply_msg) return;

    // Idempotency guard: insert the call row first. If call_sid already exists
    // (re-delivered webhook / concurrent run), the UNIQUE constraint errors and
    // we bail — the prior delivery already handled this call.
    const { error: insErr } = await db.from("calls").insert({
      organization_id: args.orgId,
      client_id: args.clientId,
      from_number: caller.value,
      to_number: args.toNumber,
      status: verdict.status,
      twilio_call_sid: args.callId,
      auto_replied: false,
    });
    if (insErr) return;

    // De-dup repeat callers: if we already texted this number in the last 4h,
    // log the call but don't send again (row stays auto_replied=false).
    const fourHoursAgo = new Date(Date.now() - 4 * 3600_000).toISOString();
    const { count } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", args.orgId)
      .eq("direction", "outbound")
      .eq("to_address", caller.value)
      .gt("sent_at", fourHoursAgo);
    if (count) return;

    const replyBody = org.auto_reply_msg;
    // Through the Messaging Service when one is configured: the number the call
    // came in on may be voice-only, and a bare `from` send is filtered as
    // unregistered (30034) — silently, since this whole path is best-effort.
    const sender = twilioSender(args.toNumber);
    if (!sender) return;
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    await client.messages.create({ ...sender, ...twilioStatusCallback(), to: caller.value, body: replyBody });

    await db.from("messages").insert({
      organization_id: args.orgId,
      client_id: args.clientId,
      channel: "sms",
      direction: "outbound",
      from_address: args.toNumber,
      to_address: caller.value,
      body: replyBody,
      read: true,
      sent_at: new Date().toISOString(),
    });
    await db
      .from("calls")
      .update({ auto_replied: true, reply_body: replyBody })
      .eq("twilio_call_sid", args.callId);

    await createNotificationService(args.orgId, {
      type: "missed_call",
      title: "Missed call — auto-texted",
      body: `Texted ${caller.value} back`,
      link: "/voice",
    });

    // Slack notification (fire-and-forget)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    void notifySlackMissedCall(args.orgId, {
      callerNumber: caller.value,
      autoTexted: true,
      voiceUrl: `${appUrl}/voice`,
    });
  } catch (e) {
    console.error("[retell webhook] missed-call text-back failed:", e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Retell nests the data under `call`; tolerate a flat shape too.
    const call = (body?.call ?? body) as Record<string, unknown>;
    const callId = String(call.call_id ?? call.callId ?? body?.call_id ?? "");
    if (!callId) return NextResponse.json({ success: true });

    const event = String(body?.event ?? "");
    // Only an authenticated webhook (?k=<RETELL_FUNCTION_SECRET>) may trigger the
    // outbound text-back. When no secret is configured the endpoint is open, same
    // as the rest of the Retell integration. Call logging stays unconditional.
    const secret = process.env.RETELL_FUNCTION_SECRET;
    const authed = !secret || request.nextUrl.searchParams.get("k") === secret;
    const direction = call.direction === "outbound" ? "outbound" : "inbound";
    const fromNumber = String(call.from_number ?? "");
    const toNumber = String(call.to_number ?? "");
    const dynVars = (call.retell_llm_dynamic_variables ?? {}) as Record<string, string>;
    const analysis = (call.call_analysis ?? {}) as Record<string, unknown>;
    const summary = (analysis.call_summary as string) || (call.summary as string) || null;
    const recordingUrl = (call.recording_url as string) || null;
    const startTs = Number(call.start_timestamp ?? 0);
    const endTs = Number(call.end_timestamp ?? 0);
    const durationMs = Number(call.duration_ms ?? (endTs && startTs ? endTs - startTs : 0));
    const transcriptObj = call.transcript_object as TranscriptTurn[] | undefined;
    const disconnectionReason = String(call.disconnection_reason ?? "");
    const userTurns = Array.isArray(transcriptObj)
      ? transcriptObj.filter((t) => t.role === "user" && String(t.content ?? "").trim().length > 0).length
      : 0;

    const db = await createServiceClient();

    // Resolve the org from the call: dynamic var first, else the business number
    // (to_number for inbound, from_number for outbound).
    const businessNumber = direction === "outbound" ? fromNumber : toNumber;
    const orgId = dynVars.org_id || (await findOrgIdByNumber(db, businessNumber));
    if (!orgId) return NextResponse.json({ success: true });

    // Link the caller to a contact. Inbound: the caller (from_number). Outbound is
    // already linked at creation, so we don't overwrite it here.
    let clientId: string | null = null;
    if (direction === "inbound" && fromNumber) {
      const caller = normalizePhoneE164(fromNumber);
      if (caller.ok) clientId = await matchOrCreateClient(orgId, caller.value);
    }

    const row: Record<string, unknown> = {
      organization_id: orgId,
      call_sid: callId,
      from_number: fromNumber || "unknown",
      to_number: toNumber || "unknown",
      direction,
      status: event === "call_started" ? "active" : "completed",
    };
    if (summary) row.summary = summary;
    if (recordingUrl) row.recording_url = recordingUrl;
    if (durationMs > 0) row.duration_seconds = Math.round(durationMs / 1000);
    if (clientId) row.client_id = clientId;
    if (Array.isArray(transcriptObj) && transcriptObj.length) {
      row.messages = transcriptObj.map((t) => ({
        role: t.role === "user" ? "user" : "assistant",
        content: String(t.content ?? ""),
      }));
    }

    await db.from("voice_sessions").upsert(row, { onConflict: "call_sid" });

    // On analysis of an inbound call, create an owner follow-up task linked to
    // the caller's contact, with the AI call summary in the notes.
    if (event === "call_analyzed" && direction === "inbound" && summary && clientId) {
      try {
        await createInboundFollowUpTask(db, { orgId, clientId, callId, summary, fromNumber });
      } catch (taskErr) {
        console.error("Retell webhook: follow-up task failed", taskErr);
      }
    }

    // Attribute the inbound call to Emma (AI Receptionist): record it as one run and
    // bump calls_answered. Idempotent per call_sid; best-effort (never throws).
    if (event === "call_analyzed" && direction === "inbound") {
      await attributeCallToEmma(db, orgId, {
        callId,
        outcome: { from: fromNumber, ...(summary ? { summary } : {}), ...(durationMs > 0 ? { durationSeconds: Math.round(durationMs / 1000) } : {}) },
      });
    }

    // Log call to communication timeline on call_analyzed (has summary + duration)
    if (event === "call_analyzed" && clientId && durationMs > 0) {
      void logCallCommunication({
        clientId,
        phoneNumber: direction === "inbound" ? fromNumber : toNumber,
        durationSeconds: Math.round(durationMs / 1000),
        callSid: callId,
        direction: direction as "inbound" | "outbound",
        summary: summary ?? undefined,
        // Emma's AI employee ID is looked up lazily — we pass null for now and
        // rely on the `from_ai_employee_id` being set by attribution separately
      });
    }

    // Missed-call text-back: when an inbound call ends without the caller being
    // served, auto-text them. Runs in after() so Retell's response stays fast.
    if (authed && event === "call_ended" && direction === "inbound") {
      after(() =>
        maybeTextBackMissedCall(db, {
          orgId,
          callId,
          fromNumber,
          toNumber,
          clientId,
          disconnectionReason,
          userTurns,
        }),
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Retell webhook error:", error);
    // Always 200 so Retell doesn't retry-storm.
    return NextResponse.json({ success: true });
  }
}
