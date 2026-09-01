import OpenAI from "openai";
import { buildSmsSystemInstructions } from "@/lib/agent-ai/promptBuilder";
import { replyJsonSchema } from "@/lib/ai-sms/replySchema";
import { getAgentAiSettings } from "@/lib/agent-ai/settings";
import { resolveLeadOutboundLocale } from "@/lib/locales/resolveLocale";
import { buildSmsUserPrompt, SMS_ASSISTANT_SYSTEM_PROMPT } from "./prompts";
import { inferIntentHeuristic } from "./intent";
import { needsHumanEscalation, shouldStopMessaging } from "./safety";
import type { SmsAssistantReply, SmsReplyContext } from "./types";

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function smsModel() {
  return (
    process.env.OPENAI_SMS_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

function buildLeadSummary(ctx: SmsReplyContext) {
  if (!ctx.lead) return "No existing lead record. New SMS lead.";
  return JSON.stringify({
    leadId: ctx.lead.leadId,
    name: ctx.lead.name,
    phone: ctx.lead.phone,
    status: ctx.lead.status,
    leadScore: ctx.lead.leadScore,
    leadTemperature: ctx.lead.leadTemperature,
    propertyAddress: ctx.lead.propertyAddress,
    city: ctx.lead.city,
    state: ctx.lead.state,
    intent: ctx.lead.intent,
  });
}

function buildRecentMessagesText(ctx: SmsReplyContext) {
  if (!ctx.recentMessages.length) return "No prior SMS messages.";
  return ctx.recentMessages.map((m) => `${m.direction.toUpperCase()}: ${m.body}`).join("\n");
}

/** First name only. "Hi Angel Zhao" is how a database greets someone. */
function firstName(full: string | null | undefined): string {
  const n = (full ?? "").trim().split(/\s+/)[0] ?? "";
  return n || "there";
}

/**
 * Shorten a stored address for speech-sized text. The CRM holds the full postal
 * form — "1613 S Atlantic Blvd apt b, Alhambra, CA 91803, USA" — and reciting a
 * ZIP and a country back at someone about their own home reads like a mail
 * merge. Street and city is how a person refers to it.
 */
function shortAddress(addr: string | null | undefined): string {
  const parts = (addr ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]}, ${parts[1]}`;
}

/**
 * What we send when the AI could not answer.
 *
 * This used to be a first-touch greeting, sent whatever point the conversation
 * had reached. Someone who had just written "we're thinking of upgrading" got
 * "thanks for texting about <full postal address>. What's the best way to help
 * you today — buying, selling, or a quick question?" — a question they had
 * answered in the previous message, from a system that appeared to have
 * forgotten them mid-conversation.
 *
 * So the fallback now depends on whether we are actually at the start. On a
 * first contact the greeting is right. Once someone has said something, the
 * honest move is to acknowledge it and put a human on it — bluffing a fresh
 * start is worse than admitting the handover, and the agent gets pulled in
 * rather than finding out later.
 */
function fallbackReply(ctx: SmsReplyContext): SmsAssistantReply {
  const intent = inferIntentHeuristic(ctx.inboundBody);
  const name = firstName(ctx.lead?.name);
  const addr = shortAddress(ctx.lead?.propertyAddress);
  const midConversation = ctx.recentMessages.some((m) => m.direction === "inbound");

  if (midConversation) {
    return {
      replyText: `Thanks ${name} — let me get you a proper answer on that. I'll have someone follow up shortly.`,
      inferredIntent: intent,
      // The AI failed on a live conversation. That is precisely when a person
      // should be looking at it.
      nextBestAction: "notify_agent",
      hotLead: false,
      needsHuman: true,
      tags: ["fallback", "ai_unavailable"],
    };
  }

  let replyText = `Hi ${name} — thanks for texting${addr ? ` about ${addr}` : ""}. What’s the best way to help you today — buying, selling, or a quick question?`;
  if (intent === "seller_home_value" || intent === "seller_list_home") {
    replyText = `Hi ${name} — happy to help. What’s the property address you’re thinking about?`;
  }
  if (intent === "buyer_listing_inquiry") {
    replyText = `Thanks for reaching out. Which listing or area are you interested in, and would you like a tour?`;
  }
  if (intent === "buyer_financing") {
    replyText = `Got it. Are you looking for a lender intro or a quick affordability check?`;
  }
  return {
    replyText,
    inferredIntent: intent,
    nextBestAction: "continue_ai",
    hotLead: false,
    needsHuman: false,
    tags: ["fallback"],
  };
}



export async function generateSmsAssistantReply(ctx: SmsReplyContext): Promise<SmsAssistantReply> {
  if (shouldStopMessaging(ctx.inboundBody)) {
    return {
      replyText:
        "Understood — we’ll stop messaging this number. If you ever need help again, just text us anytime.",
      inferredIntent: ctx.inferredIntent,
      nextBestAction: "continue_ai",
      hotLead: false,
      needsHuman: false,
      tags: ["opt_out"],
    };
  }

  if (needsHumanEscalation(ctx.inboundBody)) {
    return {
      replyText:
        "Thanks for reaching out. I’m flagging this for a team member now so someone can follow up directly as soon as possible.",
      inferredIntent: ctx.inferredIntent,
      nextBestAction: "notify_agent",
      hotLead: true,
      needsHuman: true,
      tags: ["human_escalation"],
    };
  }

  const openai = getOpenAI();
  if (!openai) {
    console.error("[ai-sms] OPENAI_API_KEY missing — replying from the fallback script");
    return fallbackReply(ctx);
  }

  const agentAi = await getAgentAiSettings(ctx.lead?.assignedAgentId ?? undefined);
  // Resolve the lead's outbound locale through the registry-backed resolver.
  // Contact-level preference dominates; agent's existing default_language
  // (from agent_ai_settings, surfaced as agentAi.defaultLanguage with
  // values 'en' | 'zh' | 'auto') is the fallback. 'auto' and unknown
  // values coerce back to 'en' inside the resolver.
  const outboundLocale = resolveLeadOutboundLocale({
    leadPreferredLanguage: ctx.lead?.preferredLanguage ?? null,
    agentDefaultOutboundLanguage: agentAi.defaultLanguage,
  });
  const instructions = buildSmsSystemInstructions(
    SMS_ASSISTANT_SYSTEM_PROMPT,
    agentAi,
    outboundLocale,
  );

  const prompt = buildSmsUserPrompt({
    inboundBody: ctx.inboundBody,
    leadSummary: buildLeadSummary(ctx),
    recentMessages: buildRecentMessagesText(ctx),
  });

  try {
    const response = await openai.responses.create({
      model: smsModel(),
      instructions,
      input: [{ role: "user", content: prompt }],
      text: {
        format: {
          type: "json_schema",
          name: "sms_assistant_reply",
          strict: true,
          schema: replyJsonSchema as unknown as Record<string, unknown>,
        },
      },
    });

    const outputText = response.output_text?.trim();
    if (!outputText) {
      console.error("[ai-sms] model returned no text — replying from the fallback script");
      return fallbackReply(ctx);
    }

    const parsed = JSON.parse(outputText) as SmsAssistantReply;
    if (!parsed.inferredIntent) {
      parsed.inferredIntent = inferIntentHeuristic(ctx.inboundBody);
    }
    if (!Array.isArray(parsed.tags)) {
      parsed.tags = [];
    }
    return parsed;
  } catch (e) {
    // Swallowing this is how a generic script reached a live conversation with
    // nobody the wiser. The customer still gets an answer; we get a reason.
    console.error("[ai-sms] reply generation failed:", e instanceof Error ? e.message : e);
    return fallbackReply(ctx);
  }
}
