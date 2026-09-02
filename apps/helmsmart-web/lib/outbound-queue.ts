/**
 * Shared outbound-call mechanics (server-only). Used by both the single-contact
 * "AI Call" action and the bulk "Call all" flow. Kept out of the "use server"
 * action file because that file may only export server actions.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { createPhoneCall, getRetellNumber } from "@/lib/retell";
import {
  loadReceptionistContext,
  buildOutboundDynamicVariables,
  type OutboundPurpose,
  type ReceptionistContext,
} from "@/lib/receptionist-agent";
import { normalizePhoneE164 } from "@/lib/phone";
import twilio from "twilio";
import { twilioSender } from "@/lib/twilio-sender";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;
type QueueClient = { id: string; first_name: string; last_name: string | null; phone: string | null };

/** Only dial 8am–9pm in the business's timezone (compliance). */
export function withinCallingHours(timezone: string): boolean {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  const hour = parseInt(hourStr, 10) % 24;
  return hour >= 8 && hour < 21;
}

// Cache the number -> agentId resolution so we don't hit Retell's API on every
// outbound call. The binding rarely changes; a warm function instance reuses it.
const AGENT_ID_TTL_MS = 10 * 60_000;
const agentIdCache = new Map<string, { id: string; expires: number }>();

/** The agent that places the call: the configured shared agent, else the one
 *  already bound to the number for inbound (so outbound needs no extra env).
 *  The number->agent lookup is cached to keep call placement fast. */
export async function resolveOutboundAgentId(ctx: ReceptionistContext): Promise<string | null> {
  const envAgent = process.env.RETELL_AGENT_ID;
  if (envAgent) return envAgent;

  const num = ctx.twilioNumber;
  if (!num) return null;

  const cached = agentIdCache.get(num);
  if (cached && cached.expires > Date.now()) return cached.id;

  const wiring = await getRetellNumber(num);
  const id = wiring.agentIds[0];
  if (id) agentIdCache.set(num, { id, expires: Date.now() + AGENT_ID_TTL_MS });
  return id ?? null;
}

/** Place one outbound call and log it as a voice_session. Assumes calling hours
 *  were already checked and the org context is loaded. Returns the Retell call id. */
export async function placeOutboundCall(
  db: ServiceClient,
  ctx: ReceptionistContext,
  client: QueueClient,
  purpose: OutboundPurpose,
  agentId: string,
  detail?: string
): Promise<string> {
  if (!ctx.twilioNumber) throw new Error("No phone number connected.");
  if (!client.phone) throw new Error("No phone number.");
  const toResult = normalizePhoneE164(client.phone);
  if (!toResult.ok) throw new Error(toResult.error);
  const to = toResult.value;

  const leadName = `${client.first_name}${client.last_name ? ` ${client.last_name}` : ""}`.trim();
  const dynamicVariables = buildOutboundDynamicVariables(ctx, { leadName, purpose, detail });

  const { callId } = await createPhoneCall({
    fromNumber: ctx.twilioNumber,
    toNumber: to,
    agentId,
    dynamicVariables,
    metadata: { org_id: ctx.orgId, client_id: client.id, purpose },
  });

  await db.from("voice_sessions").insert({
    organization_id: ctx.orgId,
    call_sid: callId,
    from_number: ctx.twilioNumber,
    to_number: to,
    direction: "outbound",
    purpose,
    client_id: client.id,
    status: "active",
  });

  return callId;
}

/** Enqueue contacts for a bulk call, skipping any already pending. Returns the count enqueued. */
export async function enqueueCalls(
  db: ServiceClient,
  orgId: string,
  purpose: OutboundPurpose,
  clientIds: string[],
  detail?: string
): Promise<number> {
  if (!clientIds.length) return 0;

  const { data: pending } = await db
    .from("outbound_call_queue")
    .select("client_id")
    .eq("organization_id", orgId)
    .eq("purpose", purpose)
    .in("status", ["queued", "calling"])
    .in("client_id", clientIds);
  const pendingSet = new Set((pending ?? []).map((r) => r.client_id as string));

  const toInsert = clientIds.filter((id) => !pendingSet.has(id));
  if (!toInsert.length) return 0;

  const { error } = await db
    .from("outbound_call_queue")
    .insert(toInsert.map((client_id) => ({ organization_id: orgId, client_id, purpose, status: "queued", detail: detail ?? null })));
  if (error) throw new Error(error.message);
  return toInsert.length;
}

/** Dial queued rows for an org, staggered, up to `limit`. No-op outside hours. */
export async function drainOutboundQueue(
  db: ServiceClient,
  orgId: string,
  opts: { limit: number; staggerMs: number }
): Promise<{ placed: number; failed: number }> {
  const ctx = await loadReceptionistContext(db, orgId);
  if (!ctx.twilioNumber || !withinCallingHours(ctx.timezone)) return { placed: 0, failed: 0 };
  const agentId = await resolveOutboundAgentId(ctx);
  if (!agentId) return { placed: 0, failed: 0 };

  const { data: rows } = await db
    .from("outbound_call_queue")
    .select("id, client_id, purpose, event_id, detail")
    .eq("organization_id", orgId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(opts.limit);
  if (!rows?.length) return { placed: 0, failed: 0 };

  let placed = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    await db
      .from("outbound_call_queue")
      .update({ status: "calling", attempts: 1, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    const { data: client } = await db
      .from("clients")
      .select("id, first_name, last_name, phone")
      .eq("id", row.client_id)
      .single();

    try {
      if (!client) throw new Error("Contact not found.");
      // Survey / promo carry their message in the queue row; appointment
      // reminders derive the exact time from the linked event below.
      let detail: string | undefined = (row.detail as string | null) ?? undefined;
      if (row.event_id) {
        const { data: evt } = await db.from("events").select("start_at").eq("id", row.event_id as string).single();
        if (evt?.start_at) {
          detail = new Intl.DateTimeFormat("en-US", {
            timeZone: ctx.timezone,
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(evt.start_at as string));
        }
      }
      const callId = await placeOutboundCall(db, ctx, client as QueueClient, row.purpose as OutboundPurpose, agentId, detail);
      await db
        .from("outbound_call_queue")
        .update({ status: "done", call_sid: callId, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      placed++;
    } catch (e) {
      await db
        .from("outbound_call_queue")
        .update({ status: "failed", last_error: e instanceof Error ? e.message : "failed", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      failed++;
    }

    // Stagger initiations so a whole list doesn't ring at once.
    if (i < rows.length - 1 && opts.staggerMs > 0) {
      await new Promise((r) => setTimeout(r, opts.staggerMs));
    }
  }

  return { placed, failed };
}

/**
 * Enqueue reminder calls for appointments that have entered the org's lead window
 * and don't already have a reminder. Idempotent (one queue row per event via the
 * event_id partial unique index), so it's safe to run every few minutes. Returns
 * how many reminders were newly scheduled.
 */
export async function scheduleDueReminders(
  db: ServiceClient,
  orgId: string,
  leadMinutes: number
): Promise<number> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + Math.max(0, leadMinutes) * 60_000);

  // Future appointments now within the lead window, that have a contact.
  const { data: appts } = await db
    .from("events")
    .select("id, client_id")
    .eq("organization_id", orgId)
    .eq("type", "appointment")
    .gt("start_at", now.toISOString())
    .lte("start_at", windowEnd.toISOString())
    .not("client_id", "is", null);
  if (!appts?.length) return 0;

  // Skip appointments that already have a reminder queued/placed.
  const eventIds = appts.map((a) => a.id as string);
  const { data: existing } = await db
    .from("outbound_call_queue")
    .select("event_id")
    .eq("purpose", "appointment_reminder")
    .in("event_id", eventIds);
  const already = new Set((existing ?? []).map((r) => r.event_id as string));

  const toInsert = appts
    .filter((a) => !already.has(a.id as string))
    .map((a) => ({
      organization_id: orgId,
      client_id: a.client_id as string,
      event_id: a.id as string,
      purpose: "appointment_reminder",
      status: "queued",
    }));
  if (!toInsert.length) return 0;

  const { error } = await db.from("outbound_call_queue").insert(toInsert);
  if (error) return 0; // unique-index race — another run already scheduled it
  return toInsert.length;
}

// ─── SMS reminders ────────────────────────────────────────────────────────────
// Parallel to the voice reminder path: for orgs with reminders enabled, send
// a text message (reschedule link + CANCEL line) alongside the voice call.
// De-dup via the same outbound_call_queue unique (event_id, purpose) index,
// using purpose='appointment_reminder_sms'.

/**
 * Enqueue SMS reminders for appointments now inside the lead window.
 * Idempotent: if the queue row already exists for this event+purpose, the
 * unique-index conflict is swallowed and the function returns 0. Returns the
 * number of newly scheduled reminders.
 */
export async function scheduleDueSmsReminders(
  db: ServiceClient,
  orgId: string,
  leadMinutes: number
): Promise<number> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + Math.max(0, leadMinutes) * 60_000);

  const { data: appts } = await db
    .from("events")
    .select("id, client_id")
    .eq("organization_id", orgId)
    .eq("type", "appointment")
    .gt("start_at", now.toISOString())
    .lte("start_at", windowEnd.toISOString())
    .not("client_id", "is", null);
  if (!appts?.length) return 0;

  const eventIds = appts.map((a) => a.id as string);
  const { data: existing } = await db
    .from("outbound_call_queue")
    .select("event_id")
    .eq("purpose", "appointment_reminder_sms")
    .in("event_id", eventIds);
  const already = new Set((existing ?? []).map((r) => r.event_id as string));

  const toInsert = appts
    .filter((a) => !already.has(a.id as string))
    .map((a) => ({
      organization_id: orgId,
      client_id: a.client_id as string,
      event_id: a.id as string,
      purpose: "appointment_reminder_sms",
      status: "queued",
    }));
  if (!toInsert.length) return 0;

  const { error } = await db.from("outbound_call_queue").insert(toInsert);
  if (error) return 0;
  return toInsert.length;
}

/**
 * Send queued SMS reminders for an org. For each queued row: load the event
 * time + reschedule token, build a text with a reschedule link + CANCEL line,
 * send via Twilio, mark the row done. Best-effort per row — one failure doesn't
 * block the rest. Returns sent/failed counts.
 */
export async function drainSmsReminderQueue(
  db: ServiceClient,
  orgContext: { orgId: string; orgName: string; twilioNumber: string; timezone: string }
): Promise<{ sent: number; failed: number }> {
  const { orgId, orgName, twilioNumber, timezone } = orgContext;

  const { data: rows } = await db
    .from("outbound_call_queue")
    .select("id, client_id, event_id")
    .eq("organization_id", orgId)
    .eq("purpose", "appointment_reminder_sms")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(25);
  if (!rows?.length) return { sent: 0, failed: 0 };

  const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // Mark as "calling" first (reuse the voice queue status) so a concurrent
      // run doesn't double-send.
      await db
        .from("outbound_call_queue")
        .update({ status: "calling", attempts: 1, updated_at: new Date().toISOString() })
        .eq("id", row.id);

      const [{ data: evt }, { data: client }] = await Promise.all([
        db.from("events").select("start_at, reschedule_token").eq("id", row.event_id as string).single(),
        db.from("clients").select("phone").eq("id", row.client_id as string).single(),
      ]);

      if (!evt || !client?.phone) throw new Error("Missing event or client phone.");

      const timeLabel = timeFmt.format(new Date(evt.start_at as string));
      const token = evt.reschedule_token as string | null;
      const link = token ? `${appUrl}/reschedule/${token}` : "";
      const body =
        `Reminder: appt on ${timeLabel}. Reply CANCEL to cancel` +
        (link ? `, or reschedule: ${link}` : "") +
        `. — ${orgName}`;

      const toResult = normalizePhoneE164(client.phone);
      if (!toResult.ok) throw new Error(`Invalid phone: ${toResult.error}`);

      const sms = await twilioClient.messages.create({ ...(twilioSender(twilioNumber) ?? { from: twilioNumber }), to: toResult.value, body });

      await db.from("messages").insert({
        organization_id: orgId,
        client_id: row.client_id as string,
        channel: "sms",
        direction: "outbound",
        from_address: twilioNumber,
        to_address: toResult.value,
        body,
        intent: "sms_reminder",
        read: true,
        external_id: sms.sid,
        sent_at: new Date().toISOString(),
      });

      await db
        .from("outbound_call_queue")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    } catch (e) {
      await db
        .from("outbound_call_queue")
        .update({
          status: "failed",
          last_error: e instanceof Error ? e.message : "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return { sent, failed };
}
