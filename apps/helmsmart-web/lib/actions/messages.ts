"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { updateOrg, type OrgUpdateResult } from "@/lib/actions/org-update";
import {
  sendEmailGuarded,
  sendSmsAsOrg,
  toSendMessageResult,
  type SendMessageResult,
} from "@/lib/outbound-send";
import Anthropic from "@anthropic-ai/sdk";
import { detectLanguage, replyLanguageRule, type Lang } from "@/lib/language";
import { contactLanguageFor } from "@/lib/i18n/contactLocale";
import { normalizePhoneE164 } from "@/lib/phone";
import { getServerLocale, getServerT } from "@/lib/i18n/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/*
 * Both sends below go through lib/outbound-send.ts: the client's opt-outs are
 * checked before the provider is called, and the row records `sent_by:
 * "person"`. They RETURN a result instead of throwing, so a refused or failed
 * send reaches the screen as a sentence — "Priya Patel opted out of text
 * messages on Sep 3 (replied STOP). You can still email Priya." — rather than
 * an uncaught error that loses what was typed.
 *
 * The sender rule (Messaging Service, then TWILIO_FROM_NUMBER, then the org's
 * own number) and E.164 normalization now live in the shared path too, so this
 * file no longer carries its own copy of either.
 */

// ─── Send email ───────────────────────────────────────────────────────────────

export async function sendEmail(
  clientId: string | null,
  toEmail: string,
  subject: string,
  body: string
): Promise<SendMessageResult> {
  const [t, tc, locale] = await Promise.all([getServerT("inbox"), getServerT("clients"), getServerLocale()]);
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, reason: "no_organization", error: t("errors.noOrganization") };

  const supabase = await createClient();
  const outcome = await sendEmailGuarded({
    db: supabase,
    orgId,
    clientId,
    to: toEmail,
    subject,
    text: body,
    purpose: "conversation",
    sentBy: "person",
  });
  return toSendMessageResult(outcome, "email", { inbox: t, clients: tc, locale });
}

// ─── Send SMS ─────────────────────────────────────────────────────────────────

export async function sendSms(clientId: string | null, toNumber: string, body: string): Promise<SendMessageResult> {
  const [t, tc, locale] = await Promise.all([getServerT("inbox"), getServerT("clients"), getServerLocale()]);
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, reason: "no_organization", error: t("errors.noOrganization") };

  const supabase = await createClient();
  const outcome = await sendSmsAsOrg(supabase, orgId, {
    clientId,
    to: toNumber,
    body,
    sentBy: "person",
    purpose: "conversation",
  });
  return toSendMessageResult(outcome, "sms", { inbox: t, clients: tc, locale });
}

// ─── Mark messages read ───────────────────────────────────────────────────────

export async function markThreadRead(clientId: string | null, address?: string | null) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return;

  const supabase = await createClient();
  const base = supabase
    .from("messages")
    .update({ read: true })
    .eq("organization_id", orgId)
    .eq("read", false);

  if (clientId) {
    await base.eq("client_id", clientId);
  } else if (address) {
    // Unmatched sender thread: mark its inbound messages read.
    await base.is("client_id", null).eq("from_address", address);
  }
}

// ─── Toggle auto-reply ────────────────────────────────────────────────────────

export async function toggleAutoReply(enabled: boolean): Promise<OrgUpdateResult> {
  const t = await getServerT("inbox");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("errors.noOrganization") };

  return updateOrg(orgId, { auto_reply: enabled }, "toggleAutoReply");
}

export async function saveAutoReplyMsg(msg: string): Promise<OrgUpdateResult> {
  const t = await getServerT("inbox");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("errors.noOrganization") };

  return updateOrg(orgId, { auto_reply_msg: msg }, "saveAutoReplyMsg");
}

export async function saveTwilioNumber(
  number: string
): Promise<{ ok: boolean; value?: string; error?: string }> {
  const t = await getServerT("inbox");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("errors.noOrganization") };

  // Blank clears the number (lets a user save other settings without one).
  if (!number.trim()) {
    const cleared = await updateOrg(orgId, { twilio_number: null }, "saveTwilioNumber:clear");
    if (!cleared.ok) return { ok: false, error: cleared.error };
    return { ok: true, value: "" };
  }

  // Validate + normalize to E.164 so a typo can't silently break call routing.
  const result = normalizePhoneE164(number);
  if (!result.ok) return { ok: false, error: result.error };

  const saved = await updateOrg(orgId, { twilio_number: result.value }, "saveTwilioNumber");
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, value: result.value };
}

// ─── AI reply draft (Week 57) ─────────────────────────────────────────────────

export async function draftReply(
  clientId: string | null,
  channel: "email" | "sms",
  address?: string | null
): Promise<string> {
  const t = await getServerT("inbox");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error(t("errors.noOrganization"));

  const supabase = await createClient();

  const base = supabase
    .from("messages")
    .select("direction, body, sent_at")
    .eq("organization_id", orgId);
  const filtered = clientId
    ? base.eq("client_id", clientId)
    : base.is("client_id", null).eq("from_address", address ?? "");

  const [{ data: org }, { data: msgs }] = await Promise.all([
    supabase.from("organizations").select("name, owner_english_assist").eq("id", orgId).single(),
    filtered.order("sent_at", { ascending: false }).limit(8),
  ]);

  let clientName = "the customer";
  let lang: Lang = "en";
  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("first_name, last_name, preferred_language")
      .eq("id", clientId)
      .eq("organization_id", orgId)
      .single();
    if (client) {
      clientName = [client.first_name, client.last_name].filter(Boolean).join(" ") || "the customer";
      lang = (client.preferred_language as Lang | null) ?? "en";
    }
  }

  const orgName = org?.name ?? "our business";
  const assist = !!org?.owner_english_assist;
  const ownerLang = contactLanguageFor(await getServerLocale());

  const recent = (msgs ?? []).slice().reverse(); // chronological
  if (!recent.length) throw new Error(t("errors.nothingToReplyTo"));

  // Unmatched threads have no stored client language — detect from their last inbound.
  if (!clientId) {
    const lastInbound = [...recent].reverse().find((m) => m.direction === "inbound");
    if (lastInbound?.body) lang = await detectLanguage(lastInbound.body);
  }

  const langRule = replyLanguageRule(lang, ownerLang, assist, "the reply");

  const transcript = recent
    .map((m) => `${m.direction === "inbound" ? clientName : orgName}: ${m.body}`)
    .join("\n");

  const lengthRule =
    channel === "sms"
      ? "Keep it under 320 characters — concise and friendly, suitable for a text message."
      : "Keep it to a short, professional paragraph or two.";

  const prompt = `You are replying on behalf of the business "${orgName}" to a ${channel === "sms" ? "text message" : "email"} from a customer (${clientName}).

Conversation so far (most recent last):
${transcript}

Write the next reply FROM ${orgName}.
- ${lengthRule}
- ${langRule}
- Helpful, warm, and professional; address their latest message directly.
- Do NOT include a subject line, a greeting placeholder like "[Name]", or a signature block — just the message body.
- Return ONLY the reply text, no quotes or markdown.`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  let text = (response.content[0] as { type: string; text: string }).text ?? "";
  text = text.trim();
  const fence = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text) throw new Error(t("errors.draftFailed"));
  return text;
}

// ─── Create a client from an unmatched conversation ─────────────────────────────

export async function createClientFromConversation(opts: {
  address: string;
  channel: "email" | "sms";
  firstName: string;
  lastName?: string | null;
}): Promise<{ error?: string; clientId?: string }> {
  const t = await getServerT("inbox");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { error: t("errors.noOrganization") };

  const firstName = opts.firstName.trim();
  if (!firstName) return { error: t("errors.nameRequired") };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("errors.unauthorized") };

  const email = opts.channel === "email" ? opts.address.toLowerCase() : null;
  const phone = opts.channel === "sms" ? opts.address : null;

  const { data: created, error } = await supabase
    .from("clients")
    .insert({
      organization_id: orgId,
      first_name: firstName,
      last_name: opts.lastName?.trim() || null,
      email,
      phone,
      status: "lead",
      source: "inbox",
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[messages] create client from conversation failed:", error);
    return { error: t("errors.createClientFailed") };
  }

  // Link this address's existing messages (both directions) to the new client.
  await supabase
    .from("messages")
    .update({ client_id: created.id })
    .eq("organization_id", orgId)
    .is("client_id", null)
    .eq("from_address", opts.address);
  await supabase
    .from("messages")
    .update({ client_id: created.id })
    .eq("organization_id", orgId)
    .is("client_id", null)
    .eq("to_address", opts.address);

  revalidatePath("/inbox");
  revalidatePath("/clients");
  return { clientId: created.id };
}
