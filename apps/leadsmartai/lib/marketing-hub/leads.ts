import "server-only";

import {
  CONSENT_SOURCE_MARKETING_HUB,
  HUB_LEAD_DISCLOSURE_VERSION,
} from "@/lib/consent/disclosureVersions";
import { recordInboundContactRequest } from "@/lib/consent/service";
import { scheduleEmailSequenceForLead } from "@/lib/emailSequences";
import { sendEmail } from "@/lib/email";
import { dispatchMobileHotLeadPush } from "@/lib/mobile/pushDispatch";
import { insertAgentInboxNotification } from "@/lib/notifications/agentNotifications";
import { loadPresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { HubConfig } from "./config";
import { SESSION_COOKIE, VISITOR_COOKIE, readCookieFromHeader } from "./visitor";

/**
 * The one way a hub visitor becomes the agent's contact.
 *
 * Used by the contact form, the AI assistant, the home-value funnel and the
 * booking page, so every channel produces the same record and the same
 * side effects. The agent id is always resolved by the caller from the URL
 * handle — never from anything the visitor sent.
 *
 * Order of work, by how much it matters:
 *   1. the contact (insert, or fill blanks on a returning visitor)
 *   2. the consent audit row
 *   3. the visitor stitch and the conversion event (attribution)
 *   4. telling the agent (inbox, push, email), a follow-up task, drip enrolment
 *
 * Only (1) can fail the call. Everything after it is best-effort: a
 * journalling outage must never cost the agent the lead.
 */

export const HUB_LEAD_INTENTS = ["buy", "sell", "invest", "rent", "relocate", "consult", "other"] as const;
export type HubLeadIntent = (typeof HUB_LEAD_INTENTS)[number];

export type HubLeadChannel = "form" | "ai_chat" | "home_value" | "booking" | "tool";

export type HubLeadInput = {
  name: string;
  email: string;
  phone: string;
  message?: string;
  smsConsent?: boolean;
  intent?: HubLeadIntent | null;
  timeline?: string | null;
  location?: string | null;
  priceRange?: string | null;
  propertyAddress?: string | null;
  estimatedValue?: number | null;
  estimateLow?: number | null;
  estimateHigh?: number | null;
  channel: HubLeadChannel;
  tool?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  /** The hub_conversations row that produced this lead, if any. */
  conversationId?: string | null;
  /** Visitor's UI locale, for the note. */
  locale?: string | null;
};

export type HubLeadResult =
  | { ok: true; contactId: string; created: boolean }
  | { ok: false; error: "name_required" | "contact_required" | "save_failed" };

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function isIntent(v: unknown): v is HubLeadIntent {
  return typeof v === "string" && (HUB_LEAD_INTENTS as readonly string[]).includes(v);
}

/** Coerce a public request body into a HubLeadInput. Clamps everything. */
export function hubLeadInputFromBody(
  body: Record<string, unknown>,
  channel: HubLeadChannel,
): HubLeadInput {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  return {
    name: clean(body.name, 120),
    email: clean(body.email, 200).toLowerCase(),
    phone: clean(body.phone, 40),
    message: clean(body.message, 2000),
    smsConsent: body.smsConsent === true,
    intent: isIntent(body.intent) ? body.intent : null,
    timeline: clean(body.timeline, 80) || null,
    location: clean(body.location, 160) || null,
    priceRange: clean(body.priceRange, 80) || null,
    propertyAddress: clean(body.propertyAddress, 300) || null,
    estimatedValue: num(body.estimatedValue),
    estimateLow: num(body.estimateLow),
    estimateHigh: num(body.estimateHigh),
    channel,
    tool: clean(body.tool, 40) || null,
    utmSource: clean(body.utmSource, 80) || null,
    utmCampaign: clean(body.utmCampaign, 120) || null,
    conversationId: clean(body.conversationId, 60) || null,
    locale: clean(body.locale, 12) || null,
  };
}

function leadTypeOf(intent: HubLeadIntent | null | undefined): string | null {
  switch (intent) {
    case "buy":
    case "relocate":
      return "buyer";
    case "sell":
      return "seller";
    case "rent":
      return "rental";
    default:
      return null;
  }
}

/** A lead with a phone number and a stated intent is worth calling today. */
function ratingOf(input: HubLeadInput): "hot" | "warm" {
  const strong =
    input.channel === "booking" ||
    input.channel === "home_value" ||
    input.intent === "sell" ||
    input.intent === "consult";
  return strong && input.phone ? "hot" : "warm";
}

/** What the agent reads first: where this came from and what they said. */
function noteOf(input: HubLeadInput, username: string): string {
  const lines: string[] = [];
  const channel: Record<HubLeadChannel, string> = {
    form: "Contact form",
    ai_chat: "AI assistant conversation",
    home_value: "Home value request",
    booking: "Consultation request",
    tool: "Tool",
  };
  lines.push(`Source: Marketing Hub (@${username}) · ${channel[input.channel]}${input.tool ? ` · ${input.tool}` : ""}`);
  if (input.intent) lines.push(`Intent: ${input.intent}`);
  if (input.timeline) lines.push(`Timeline: ${input.timeline}`);
  if (input.location) lines.push(`Location: ${input.location}`);
  if (input.priceRange) lines.push(`Price range: ${input.priceRange}`);
  if (input.propertyAddress) lines.push(`Property: ${input.propertyAddress}`);
  if (input.estimatedValue) {
    const range =
      input.estimateLow && input.estimateHigh
        ? ` (range $${input.estimateLow.toLocaleString()}–$${input.estimateHigh.toLocaleString()})`
        : "";
    lines.push(`Estimated value shown: $${input.estimatedValue.toLocaleString()}${range}`);
  }
  if (input.message) lines.push("", input.message);
  return lines.join("\n");
}

export async function captureHubLead(args: {
  agentId: number;
  username: string;
  input: HubLeadInput;
  cookieHeader: string | null;
  requestMeta: { ipAddress: string | null; userAgent: string | null };
  settings: HubConfig["leadCapture"];
}): Promise<HubLeadResult> {
  const { agentId, username, input, settings } = args;
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  if (!name) return { ok: false, error: "name_required" };
  if (!email && !phone) return { ok: false, error: "contact_required" };

  const note = noteOf(input, username);
  const nowIso = new Date().toISOString();

  // A returning visitor is an UPDATE, not a second contact. `contacts` has a
  // unique index on (agent_id, phone) and on (agent_id, lower(email)), so a
  // blind insert would fail with 23505 on the second enquiry.
  let contactId: string | null = null;
  let created = false;
  try {
    const orFilter = [phone ? `phone.eq.${phone}` : null, email ? `email.eq.${email}` : null]
      .filter(Boolean)
      .join(",");
    const existing = await supabaseAdmin
      .from("contacts")
      .select("id, notes")
      .eq("agent_id", agentId as never)
      .or(orFilter)
      .limit(1)
      .maybeSingle();
    const existingRow = existing.data as { id: string; notes: string | null } | null;

    if (existingRow?.id) {
      contactId = existingRow.id;
      const priorNotes = (existingRow.notes ?? "").trim();
      const { error } = await supabaseAdmin
        .from("contacts")
        .update({
          // Fill blanks; never overwrite what the agent curated. A second
          // enquiry is appended to the notes so nothing said is lost.
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(input.smsConsent ? { sms_opt_in: true, tcpa_consent_at: nowIso, tcpa_consent_source: "web_form" } : {}),
          ...(input.propertyAddress ? { property_address: input.propertyAddress } : {}),
          ...(input.estimatedValue ? { estimated_home_value: input.estimatedValue } : {}),
          notes: priorNotes ? `${priorNotes}\n\n— ${nowIso.slice(0, 10)} —\n${note}` : note,
          last_activity_at: nowIso,
          updated_at: nowIso,
        } as never)
        .eq("id", existingRow.id as never)
        .eq("agent_id", agentId as never);
      if (error) console.warn("[hub.lead] update failed:", error.message);
    } else {
      const inserted = await supabaseAdmin
        .from("contacts")
        .insert({
          agent_id: agentId,
          name,
          email: email || null,
          phone: phone || null,
          source: CONSENT_SOURCE_MARKETING_HUB,
          source_detail: input.tool ? `${input.channel}:${input.tool}` : input.channel,
          traffic_source: CONSENT_SOURCE_MARKETING_HUB,
          landing_page: `/@${username}`,
          tool_used: input.tool ?? (input.channel === "home_value" ? "home_value" : null),
          lead_type: leadTypeOf(input.intent),
          intent: input.intent ?? null,
          timeline: input.timeline ?? null,
          search_location: input.location ?? null,
          property_address: input.propertyAddress ?? null,
          estimated_home_value: input.estimatedValue ?? null,
          estimate_low: input.estimateLow ?? null,
          estimate_high: input.estimateHigh ?? null,
          notes: note,
          lifecycle_stage: "lead",
          lead_status: "new",
          rating: ratingOf(input),
          sms_opt_in: input.smsConsent === true,
          ...(input.smsConsent ? { tcpa_consent_at: nowIso, tcpa_consent_source: "web_form" } : {}),
          preferred_language: input.locale?.startsWith("zh") ? "zh" : null,
          last_activity_at: nowIso,
        } as never)
        .select("id")
        .maybeSingle();
      if (inserted.error || !inserted.data) {
        console.error("[hub.lead] contact insert failed:", inserted.error?.message);
        return { ok: false, error: "save_failed" };
      }
      contactId = (inserted.data as { id: string }).id;
      created = true;
    }
  } catch (e) {
    console.error("[hub.lead] threw:", e instanceof Error ? e.message : e);
    return { ok: false, error: "save_failed" };
  }

  if (!contactId) return { ok: false, error: "save_failed" };
  const id = contactId;

  // ── Everything below is best-effort ────────────────────────────────────

  const visitorId = readCookieFromHeader(args.cookieHeader, VISITOR_COOKIE);
  const sessionId = readCookieFromHeader(args.cookieHeader, SESSION_COOKIE);

  void recordInboundContactRequest({
    source: CONSENT_SOURCE_MARKETING_HUB,
    name,
    email,
    phone,
    subject: `marketing hub: @${username} (${input.channel})`,
    message: note,
    smsConsent: input.smsConsent === true,
    emailConsent: Boolean(email),
    consentDisclosureVersion: HUB_LEAD_DISCLOSURE_VERSION,
    ipAddress: args.requestMeta.ipAddress,
    userAgent: args.requestMeta.userAgent,
    contactId: id,
  });

  // THE STITCH: everything this browser did on THIS agent's hub now belongs
  // to the person they just became. Scoped by agent, and only anonymous rows.
  if (visitorId) {
    void supabaseAdmin
      .from("traffic_events")
      .update({ contact_id: id } as never)
      .eq("agent_id", agentId as never)
      .eq("visitor_id", visitorId)
      .is("contact_id", null)
      .then(({ error }) => {
        if (error) console.warn("[hub.lead] stitch:", error.message);
      });
  }

  void supabaseAdmin
    .from("traffic_events")
    .insert({
      event_type: "conversion",
      page_path: `/@${username}`,
      agent_id: agentId,
      source: input.utmSource ?? null,
      campaign: input.utmCampaign ?? null,
      visitor_id: visitorId,
      session_id: sessionId,
      contact_id: id,
      metadata: {
        kind: "hub_lead",
        channel: input.channel,
        tool: input.tool ?? null,
        intent: input.intent ?? null,
        created,
      },
    } as never)
    .then(({ error }) => {
      if (error) console.warn("[hub.lead] traffic_events:", error.message);
    });

  if (input.conversationId) {
    void supabaseAdmin
      .from("hub_conversations")
      .update({ contact_id: id, updated_at: nowIso } as never)
      .eq("id", input.conversationId as never)
      .eq("agent_id", agentId as never)
      .then(({ error }) => {
        if (error) console.warn("[hub.lead] conversation link:", error.message);
      });
  }

  void notifyAgent({ agentId, contactId: id, name, email, phone, input, settings, created }).catch((e) =>
    console.warn("[hub.lead] notify:", e instanceof Error ? e.message : e),
  );

  if (settings.createTask) {
    void supabaseAdmin
      .from("crm_tasks")
      .insert({
        agent_id: agentId,
        contact_id: id,
        title: `Follow up with ${name} (Marketing Hub)`,
        description: note,
        due_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        status: "open",
        priority: ratingOf(input) === "hot" ? "high" : "medium",
        source: "automation",
        task_type: "hub_follow_up",
        metadata_json: { channel: input.channel, tool: input.tool ?? null },
      } as never)
      .then(({ error }) => {
        if (error) console.warn("[hub.lead] task:", error.message);
      });
  }

  if (settings.enrollFollowUp && created && email) {
    void scheduleEmailSequenceForLead(id);
  }

  return { ok: true, contactId: id, created };
}

async function notifyAgent(args: {
  agentId: number;
  contactId: string;
  name: string;
  email: string;
  phone: string;
  input: HubLeadInput;
  settings: HubConfig["leadCapture"];
  created: boolean;
}): Promise<void> {
  const { agentId, contactId, name, email, phone, input, settings } = args;
  const channel: Record<HubLeadChannel, string> = {
    form: "sent you a message",
    ai_chat: "talked to your AI assistant",
    home_value: "asked what their home is worth",
    booking: "asked for a consultation",
    tool: "used a tool",
  };
  const title = args.created ? "New lead from your Marketing Hub" : "Returning lead on your Marketing Hub";
  const body = `${name} ${channel[input.channel]}${input.intent ? ` · ${input.intent}` : ""}${phone ? ` · ${phone}` : ""}`;
  const hot = ratingOf(input) === "hot";

  const { data: agentRow } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId as never)
    .maybeSingle();
  const authUserId = (agentRow as { auth_user_id: string | null } | null)?.auth_user_id ?? null;

  if (settings.notifyPush && authUserId) {
    // Writes the inbox row itself, then pushes when the agent's prefs allow.
    await dispatchMobileHotLeadPush({
      userId: authUserId,
      agentId: String(agentId),
      leadId: contactId,
      title,
      body,
    });
  } else {
    await insertAgentInboxNotification({
      agentId: String(agentId),
      type: hot ? "hot_lead" : "new_lead",
      priority: hot ? "high" : "medium",
      title,
      body,
      deepLink: { screen: "lead", leadId: contactId },
    });
  }

  if (settings.notifyEmail) {
    const agent = await loadPresentationAgent(agentId);
    if (agent.email) {
      const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.closebossai.com").replace(/\/+$/, "");
      const link = `${base}/dashboard/leads/${contactId}`;
      const lines = [
        `${name} ${channel[input.channel]} on your Marketing Hub.`,
        "",
        email ? `Email: ${email}` : null,
        phone ? `Phone: ${phone}` : null,
        input.intent ? `Intent: ${input.intent}` : null,
        input.propertyAddress ? `Property: ${input.propertyAddress}` : null,
        input.estimatedValue ? `Estimate shown: $${input.estimatedValue.toLocaleString()}` : null,
        input.message ? `\n"${input.message}"` : null,
        "",
        `Open in CloseBoss: ${link}`,
      ].filter((l): l is string => l !== null);
      await sendEmail({
        to: agent.email,
        subject: `${title}: ${name}`,
        text: lines.join("\n"),
        replyTo: email || undefined,
      });
    }
  }
}
