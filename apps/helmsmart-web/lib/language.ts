import Anthropic from "@anthropic-ai/sdk";

// Plain server module (NOT "use server") so it can be shared by webhooks, the
// dunning cron, and server actions. Uses Haiku — these are cheap, frequent calls.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5";

export type Lang = "en" | "es" | "zh";
export const SUPPORTED_LANGS: Lang[] = ["en", "es", "zh"];

const LANG_NAME: Record<Lang, string> = {
  en: "English",
  es: "Spanish",
  zh: "Chinese (Simplified)",
};

/** Human-readable name for a language code (for prompts/UI). */
export function languageName(l: Lang): string {
  return LANG_NAME[l];
}

function firstText(res: { content: Array<{ type: string; text?: string }> }): string {
  const block = res.content[0];
  return block?.type === "text" ? (block.text ?? "").trim() : "";
}

/** Cheap shortcut: any CJK character means Chinese for our supported set. */
function looksChinese(text: string): boolean {
  return /[一-鿿]/.test(text);
}

/**
 * Detect the language of an inbound message as one of en/es/zh (fallback en).
 * Chinese is caught for free via Unicode range; en/es is disambiguated by Haiku.
 */
export async function detectLanguage(text: string): Promise<Lang> {
  const t = text.trim();
  if (!t) return "en";
  if (looksChinese(t)) return "zh";
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 5,
      messages: [
        {
          role: "user",
          content: `Reply with ONLY one code — en, es, or zh — for the language of this message:\n\n${t.slice(0, 500)}`,
        },
      ],
    });
    const code = firstText(res).toLowerCase();
    return (SUPPORTED_LANGS as string[]).includes(code) ? (code as Lang) : "en";
  } catch {
    return "en";
  }
}

/** Translate arbitrary text to English (for the owner to read inbound). */
export async function translateToEnglish(text: string): Promise<string | null> {
  const t = text.trim();
  if (!t) return null;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `Translate the following message to English. Return ONLY the translation, with no preamble:\n\n${t}`,
        },
      ],
    });
    return firstText(res) || null;
  } catch {
    return null;
  }
}

/**
 * Render an English source message in the target language. When bilingual, the
 * target language comes first, then the original English on a new block — so the
 * customer reads their language and the owner can still verify what went out.
 */
export async function localizeOutbound(
  englishMessage: string,
  target: Lang,
  bilingual: boolean
): Promise<string> {
  if (target === "en") return englishMessage;
  const name = LANG_NAME[target];
  const instruction = bilingual
    ? `Rewrite the message below in ${name}, then add the original English after it separated by a blank line. Return only the result, no preamble.`
    : `Rewrite the message below in ${name}. Return only the ${name} text, no preamble.`;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: "user", content: `${instruction}\n\n${englishMessage}` }],
    });
    return firstText(res) || englishMessage;
  } catch {
    return englishMessage; // fall back to English rather than fail the send
  }
}

// ─── Inbound triage ─────────────────────────────────────────────────────────────

export type Intent = "question" | "booking" | "billing" | "complaint" | "other";
export type Priority = "low" | "normal" | "high";

const INTENTS: Intent[] = ["question", "booking", "billing", "complaint", "other"];
const PRIORITIES: Priority[] = ["low", "normal", "high"];

/*
 * The owner reads an intent in two places, and they resolve differently.
 *
 * On screen — the Inbox badge — it is UI copy, so it is translated at RENDER
 * time from the `inbox` bundle (`badges.intent.<intent>`) against whatever
 * language that reader has picked. `Intent` itself stays the stored value.
 *
 * The English below is only for text this module WRITES rather than renders:
 * the task titles the SMS and email webhooks compose. A webhook has no reader
 * and no request locale, so it stores one canonical string rather than
 * guessing whose language to freeze into the row.
 */
const INTENT_LABEL: Record<Intent, string> = {
  question: "Question",
  booking: "Scheduling request",
  billing: "Billing",
  complaint: "Complaint",
  other: "Message",
};

export function intentLabel(i: Intent): string {
  return INTENT_LABEL[i];
}

/**
 * One Haiku call that classifies an inbound message's language, intent, and
 * urgency together — so the inbox can badge/sort it and auto-create tasks for
 * actionable messages, at the cost of a single cheap call.
 */
export async function analyzeInbound(
  text: string
): Promise<{ lang: Lang; intent: Intent; priority: Priority }> {
  const t = text.trim();
  const fallback = {
    lang: (looksChinese(t) ? "zh" : "en") as Lang,
    intent: "other" as Intent,
    priority: "normal" as Priority,
  };
  if (!t) return fallback;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: `Classify this customer message. Return ONLY compact JSON:
{"lang":"en|es|zh","intent":"question|booking|billing|complaint|other","priority":"low|normal|high"}

- lang: the message language ("en" if it is not Spanish or Chinese).
- intent: booking = wants to schedule an appointment; billing = about payment, invoice, or pricing; complaint = unhappy or reporting a problem; question = a general question; other = none of these.
- priority: high = urgent, time-sensitive, or upset; normal = typical; low = FYI, no action needed.

Message:
${t.slice(0, 800)}`,
        },
      ],
    });
    const m = firstText(res).match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const p = JSON.parse(m[0]) as { lang?: string; intent?: string; priority?: string };
    return {
      lang: (SUPPORTED_LANGS as string[]).includes(p.lang ?? "") ? (p.lang as Lang) : fallback.lang,
      intent: (INTENTS as string[]).includes(p.intent ?? "") ? (p.intent as Intent) : "other",
      priority: (PRIORITIES as string[]).includes(p.priority ?? "") ? (p.priority as Priority) : "normal",
    };
  } catch {
    return fallback;
  }
}
