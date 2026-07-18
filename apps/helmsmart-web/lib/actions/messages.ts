"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
// Aliased: this module exports its own `sendEmail` server action.
import { sendEmail as sendEmailViaResend, FROM_ADDRESS } from "@/lib/email";
import twilio from "twilio";
import Anthropic from "@anthropic-ai/sdk";
import { detectLanguage, languageName, type Lang } from "@/lib/language";
import { normalizePhoneE164 } from "@/lib/phone";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function twilioClient() {
  return twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );
}

// ─── Send email ───────────────────────────────────────────────────────────────

export async function sendEmail(
  clientId: string | null,
  toEmail: string,
  subject: string,
  body: string
) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();

  const fromAddress = FROM_ADDRESS;

  // Throws if Resend rejects the send, so the messages row below is only
  // written for mail that actually left.
  const sent = await sendEmailViaResend({
    to: toEmail,
    subject,
    text: body,
  });

  await supabase.from("messages").insert({
    organization_id: orgId,
    client_id: clientId,
    channel: "email",
    direction: "outbound",
    from_address: fromAddress,
    to_address: toEmail,
    subject,
    body,
    read: true,
    external_id: sent?.id,
    sent_at: new Date().toISOString(),
  });
}

// ─── Send SMS ─────────────────────────────────────────────────────────────────

export async function sendSms(clientId: string | null, toNumber: string, body: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

  const supabase = await createClient();

  // Get org's Twilio number
  const { data: org } = await supabase
    .from("organizations")
    .select("twilio_number")
    .eq("id", orgId)
    .single();

  const fromNumber = org?.twilio_number ?? process.env.TWILIO_FROM_NUMBER;
  // US A2P 10DLC compliance is enforced at the Messaging Service level: sending
  // by bare `from` number can be filtered as "unregistered" (error 30034) even
  // when the number sits in a registered campaign. When a Messaging Service SID
  // is configured we send through it so Twilio applies the campaign; otherwise
  // we fall back to the raw number (unchanged behavior).
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!messagingServiceSid && !fromNumber) throw new Error("No Twilio number configured");

  // Twilio only reliably delivers to E.164 numbers. A bare "6066255055" gets a
  // SID back (so the UI says "Sent") but never actually arrives — normalize first
  // and fail loudly so the caller sees the real problem instead of a false success.
  const normalized = normalizePhoneE164(toNumber);
  if (!normalized.ok) throw new Error(normalized.error);
  const to = normalized.value;

  // Absolute callback so Twilio can report delivery outcome back to us. Skip it
  // for non-https/local URLs — Twilio rejects callbacks it can't reach, which
  // would fail the whole send.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const statusCallback = appUrl.startsWith("https://")
    ? `${appUrl}/api/twilio/sms/status`
    : undefined;

  const client = twilioClient();
  const msg = await client.messages.create({
    ...(messagingServiceSid ? { messagingServiceSid } : { from: fromNumber! }),
    to,
    body,
    ...(statusCallback ? { statusCallback } : {}),
  });

  await supabase.from("messages").insert({
    organization_id: orgId,
    client_id: clientId,
    channel: "sms",
    direction: "outbound",
    from_address: fromNumber ?? msg.from ?? null,
    to_address: to,
    body,
    read: true,
    external_id: msg.sid,
    sent_at: new Date().toISOString(),
  });
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

export async function toggleAutoReply(enabled: boolean) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return;

  const supabase = await createClient();
  await supabase
    .from("organizations")
    .update({ auto_reply: enabled })
    .eq("id", orgId);
}

export async function saveAutoReplyMsg(msg: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return;

  const supabase = await createClient();
  await supabase
    .from("organizations")
    .update({ auto_reply_msg: msg })
    .eq("id", orgId);
}

export async function saveTwilioNumber(
  number: string
): Promise<{ ok: boolean; value?: string; error?: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: "No organization selected." };

  const supabase = await createClient();

  // Blank clears the number (lets a user save other settings without one).
  if (!number.trim()) {
    await supabase.from("organizations").update({ twilio_number: null }).eq("id", orgId);
    return { ok: true, value: "" };
  }

  // Validate + normalize to E.164 so a typo can't silently break call routing.
  const result = normalizePhoneE164(number);
  if (!result.ok) return { ok: false, error: result.error };

  await supabase.from("organizations").update({ twilio_number: result.value }).eq("id", orgId);
  return { ok: true, value: result.value };
}

// ─── AI reply draft (Week 57) ─────────────────────────────────────────────────

export async function draftReply(
  clientId: string | null,
  channel: "email" | "sms",
  address?: string | null
): Promise<string> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error("No org");

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

  const recent = (msgs ?? []).slice().reverse(); // chronological
  if (!recent.length) throw new Error("No conversation to reply to");

  // Unmatched threads have no stored client language — detect from their last inbound.
  if (!clientId) {
    const lastInbound = [...recent].reverse().find((m) => m.direction === "inbound");
    if (lastInbound?.body) lang = await detectLanguage(lastInbound.body);
  }

  const langRule =
    lang === "en"
      ? "Write the reply in English."
      : assist
        ? `Write the reply in ${languageName(lang)}, then add an English translation after a blank line.`
        : `Write the reply entirely in ${languageName(lang)}.`;

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
  if (!text) throw new Error("Couldn't draft a reply — try again");
  return text;
}

// ─── Create a client from an unmatched conversation ─────────────────────────────

export async function createClientFromConversation(opts: {
  address: string;
  channel: "email" | "sms";
  firstName: string;
  lastName?: string | null;
}): Promise<{ error?: string; clientId?: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { error: "No organization." };

  const firstName = opts.firstName.trim();
  if (!firstName) return { error: "Name is required." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };

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
    return { error: "Failed to create client." };
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
