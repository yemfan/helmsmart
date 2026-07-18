"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { senderFrom } from "@/lib/email";
import { runAutomations } from "@/lib/automation-engine";
import Anthropic from "@anthropic-ai/sdk";
import {
  parseCampaignCopy,
  parseSubjectLines,
  statusForRecipientFilter,
  CAMPAIGN_TONE,
  REFINE_INSTRUCTION,
  type CampaignTone,
  type RefineMode,
  type RecipientFilter,
} from "@helm/dna-marketing";

export type { CampaignTone, RefineMode };

const resend = new Resend(process.env.RESEND_API_KEY ?? "");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Create campaign ──────────────────────────────────────────────────────────

export async function createCampaign(data: {
  name: string;
  subject: string;
  body: string;
  recipient_filter: RecipientFilter;
  recipient_tag?: string | null;
}): Promise<string> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      organization_id: orgId,
      name: data.name,
      subject: data.subject,
      body: data.body,
      recipient_filter: data.recipient_filter,
      recipient_tag: data.recipient_tag ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !campaign) throw new Error(error?.message ?? "Failed to create campaign");

  revalidatePath("/marketing");
  return campaign.id;
}

// ─── Send campaign ────────────────────────────────────────────────────────────

export async function sendCampaign(campaignId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();

  // Load campaign
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", orgId)
    .single();

  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "draft") throw new Error("Campaign already sent");

  // Resolve recipients
  let clientQuery = supabase
    .from("clients")
    .select("id, first_name, last_name, email")
    .eq("organization_id", orgId)
    .not("email", "is", null)
    .neq("email", "");

  const status = statusForRecipientFilter(campaign.recipient_filter as RecipientFilter);
  if (status) clientQuery = clientQuery.eq("status", status);

  if (campaign.recipient_tag) {
    clientQuery = clientQuery.contains("tags", [campaign.recipient_tag]);
  }

  const { data: clients } = await clientQuery;
  const recipients = (clients ?? []).filter((c) => c.email);

  if (!recipients.length) {
    throw new Error("No recipients found for this segment. Add email addresses to clients first.");
  }

  // Mark as sending
  await supabase
    .from("campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", campaignId);

  const orgNameRes = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();
  const orgName = orgNameRes.data?.name ?? "HelmSmart";

  // HTML template
  function buildHtml(clientName: string): string {
    const bodyHtml = campaign.body
      .split("\n")
      .map((line: string) =>
        line.trim()
          ? `<p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.6">${line}</p>`
          : "<br>"
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <tr><td style="background:#4f46e5;padding:20px 40px">
          <span style="font-size:16px;font-weight:700;color:#fff">${orgName}</span>
        </td></tr>
        <tr><td style="padding:32px 40px">
          <p style="margin:0 0 20px;font-size:15px;color:#334155">Hi ${clientName},</p>
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 40px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">Sent by ${orgName} · Powered by HelmSmart</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  // Send in batches of 50 (Resend rate limit)
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += 50) {
    const batch = recipients.slice(i, i + 50);
    const emails = batch.map((c) => ({
      from: senderFrom(orgName),
      to: c.email as string,
      subject: campaign.subject,
      html: buildHtml(
        [c.first_name, c.last_name].filter(Boolean).join(" ") || "there"
      ),
      text: `Hi ${[c.first_name, c.last_name].filter(Boolean).join(" ") || "there"},\n\n${campaign.body}\n\n— ${orgName}`,
    }));

    try {
      // batch.send resolves with { error } instead of throwing, so an
      // API rejection has to be checked explicitly or the batch gets
      // counted as delivered.
      const { error: batchError } = await resend.batch.send(emails);
      if (batchError) {
        console.error("sendCampaign: Resend rejected batch", batchError);
        failed += batch.length;
      } else {
        sent += batch.length;
      }
    } catch {
      failed += batch.length;
    }
  }

  // Mark sent (even if some failed — log counts)
  await supabase
    .from("campaigns")
    .update({
      status: failed === recipients.length ? "failed" : "sent",
      recipient_count: sent,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  revalidatePath("/marketing");
  revalidatePath(`/marketing/${campaignId}`);

  // Run automation rules for campaign_sent
  await runAutomations("campaign_sent", {
    orgId,
    campaignId,
    campaignName: campaign.name,
  });
}

// ─── Delete draft ─────────────────────────────────────────────────────────────

export async function deleteCampaign(campaignId: string) {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error("Not authenticated");

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("organization_id", orgId)
    .eq("status", "draft"); // Only drafts can be deleted

  if (error) throw new Error(error.message);
  revalidatePath("/marketing");
}

// ─── AI copywriter (Week 44) ──────────────────────────────────────────────────
// Tone presets + LLM-output parsers live in @helm/dna-marketing; this layer keeps
// the org lookup and the Anthropic call.

export async function generateCampaignCopy(input: {
  prompt: string;
  tone: CampaignTone;
}): Promise<{ subject: string; body: string }> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error("Not authenticated");
  if (!input.prompt.trim()) throw new Error("Describe what the campaign is about");

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).single();
  const orgName = org?.name ?? "our business";
  const toneDesc = CAMPAIGN_TONE[input.tone] ?? CAMPAIGN_TONE.friendly;

  const prompt = `You are an expert email marketer writing a campaign email for the business "${orgName}".

Campaign goal / topic: ${input.prompt}
Tone: ${toneDesc}

Respond with ONLY a JSON object — no markdown, no commentary — in exactly this shape:
{"subject": "<subject line>", "body": "<email body>"}

Rules:
- Subject: compelling, under 60 characters, no emoji spam.
- Body: plain text, 2–4 short paragraphs separated by a blank line. Warm opening, a clear value proposition, and one clear call to action.
- Do NOT include a greeting like "Hi [name]" — the system adds a personalized greeting automatically, so start with the first sentence of the message.
- Do NOT leave bracketed placeholders like "[Your name]"; sign off naturally as ${orgName}.
- Write specifically and naturally for ${orgName}; avoid generic filler.`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { type: string; text: string }).text ?? "";
  const parsed = parseCampaignCopy(text);
  if (!parsed.body) throw new Error("Couldn't generate copy — try rephrasing your prompt");
  return parsed;
}

export async function generateSubjectLines(input: {
  context: string;
  tone: CampaignTone;
}): Promise<string[]> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error("Not authenticated");
  if (!input.context.trim()) throw new Error("Write a message or describe the campaign first");

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).single();
  const orgName = org?.name ?? "our business";
  const toneDesc = CAMPAIGN_TONE[input.tone] ?? CAMPAIGN_TONE.friendly;

  const prompt = `You are an expert email marketer for the business "${orgName}".
Generate 5 high-performing subject lines for this campaign.

Campaign content / topic:
${input.context.trim().slice(0, 1500)}

Tone: ${toneDesc}

Rules:
- Each subject line under 55 characters.
- Make the 5 genuinely different angles (e.g. benefit, curiosity, urgency, question, personal).
- No emoji spam (at most one, only if it fits the tone). No surrounding quotes.

Respond with ONLY a JSON array of 5 strings, e.g.:
["First option", "Second option", "Third option", "Fourth option", "Fifth option"]`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (response.content[0] as { type: string; text: string }).text ?? "";
  const ideas = parseSubjectLines(text);
  if (!ideas.length) throw new Error("Couldn't generate subject lines — try again");
  return ideas;
}

export async function refineCampaignBody(input: { body: string; mode: RefineMode }): Promise<string> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) throw new Error("Not authenticated");
  if (!input.body.trim()) throw new Error("Nothing to refine yet");

  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).single();
  const orgName = org?.name ?? "our business";
  const instruction = REFINE_INSTRUCTION[input.mode] ?? REFINE_INSTRUCTION.grammar;

  const prompt = `You are an expert email copy editor for the business "${orgName}". Revise the marketing email body below.

Instruction: ${instruction}

Rules:
- Return ONLY the revised body as plain text — no preamble, no quotes, no markdown fences.
- Keep paragraphs separated by a blank line.
- Do NOT add a greeting like "Hi [name]" — the system adds one automatically.
- Do NOT leave bracketed placeholders; if a sign-off is present, sign off as ${orgName}.

Email body:
${input.body.trim()}`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });

  let text = (response.content[0] as { type: string; text: string }).text ?? "";
  text = text.trim();
  const fence = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text) throw new Error("Couldn't refine — try again");
  return text;
}
