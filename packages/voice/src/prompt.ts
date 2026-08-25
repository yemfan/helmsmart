/**
 * Shared, model-agnostic prompt builders for the AI voice receptionist.
 *
 * Everything here is a pure function of a plain `ReceptionistContext` value (all
 * strings) — no database, no tenant assumptions — so every app can produce the
 * context from its own data model and reuse the exact same prompts, greeting,
 * and Retell dynamic variables. The system prompt is the single source of truth,
 * injected into the shared Retell agent as the {{system_prompt}} variable.
 */

// ─── Per-call context (produced per-app, consumed here) ───────────────────────────

export type ReceptionistContext = {
  orgId: string;
  orgName: string;
  orgNameZh: string;
  agentName: string;
  twilioNumber: string | null;
  timezone: string;
  todayISO: string;
  todayLabel: string;
  hoursText: string;
  typesText: string;
  knowledgeText: string;
  extraNotes: string;
  greeting: string;
  /** Inbound only: the caller's own phone number (caller ID), formatted for
   *  speech. When set, the receptionist confirms it as the callback number. */
  callerNumber?: string;
  /** Inbound only: what we already know about this caller, matched by their
   *  phone number. When set, the receptionist greets them by name and CONFIRMS
   *  what's on file (rather than re-asking). Omitted for unknown callers. */
  knownCaller?: KnownCaller;
};

/** What we already know about a recognized inbound caller (matched by caller ID).
 *  The app builds this from its own contact record; the prompt core just phrases
 *  it. All fields optional — include only what's actually known. */
export type KnownCaller = {
  /** Full name on file, e.g. "Michael Ye". */
  name?: string;
  /** ISO 639-1 language preference, e.g. "zh" — used to greet in their language. */
  language?: string;
  /** One-line, human-readable summary of their known preferences, app-built,
   *  e.g. "buyer, interested in Alhambra, budget $800k–$1M, 3 bed / 2 bath,
   *  timeline 2 months". Empty when we only know their name. */
  summary?: string;
};

/** First name only, for a natural "is this Michael?" confirmation. */
function firstName(name: string | undefined): string {
  return (name || "").trim().split(/\s+/)[0] || "";
}

/** Resolve {{agent_name}} / {{business_name}} placeholders a business may use in
 *  their greeting or business-context text. Done server-side because Retell does
 *  not recursively expand placeholders nested inside a dynamic variable. */
function fillPlaceholders(text: string, ctx: ReceptionistContext): string {
  return (text || "")
    .replace(/\{\{\s*agent_name\s*\}\}/gi, ctx.agentName.trim())
    .replace(/\{\{\s*business_name_zh\s*\}\}/gi, ctx.orgNameZh)
    .replace(/\{\{\s*business_name\s*\}\}/gi, ctx.orgName);
}

// ─── Inbound system prompt ────────────────────────────────────────────────────────

/**
 * The full per-business inbound system prompt, assembled from the org's brain
 * (hours, services, knowledge base, business context) plus the standard
 * receptionist behaviour. Injected into the shared Retell agent as the
 * {{system_prompt}} dynamic variable, so changing booking behaviour here reaches
 * every business without touching Retell.
 */
export function buildSystemPrompt(ctx: ReceptionistContext): string {
  return `## Your first reply
${ctx.knownCaller ? `You already greeted this caller by name — do NOT greet again or re-introduce yourself. Just respond to what they say.` : `All the caller has heard so far is "${OPENING_HELLO}" — a hello in each language you speak, and nothing else. They have not been told the business name, and you have not introduced yourself.

The moment they speak, note which language they used. Your FIRST reply is this greeting, spoken in THAT language:

"${firstReplyGreeting(ctx)}"

Translate it naturally into the caller's language — do not read the English wording to a caller who spoke Chinese or Spanish, and never mix languages in one sentence. Say it once, then carry on with whatever they asked. Every reply after this one follows the language rules below.`}

## Languages Speak in whichever language the caller uses, and switch the moment they switch. Never ask which language they prefer. CRITICAL — this rule overrides everything else and applies on EVERY single turn, INCLUDING the turn right after you use a tool: reply in the language the caller last spoke. check_availability and book_appointment return English text for the system's use only — that English must NOT change the language you speak. If the caller has been speaking Chinese, keep speaking Chinese after checking the calendar (translate the times, e.g. "6月2号星期一上午11点"). Never switch to English unless the caller switches first.${ctx.orgNameZh !== ctx.orgName ? ` When you speak Chinese, call the business "${ctx.orgNameZh}"; in English call it "${ctx.orgName}".` : ""}

You are ${ctx.agentName ? `${ctx.agentName}, ` : ""}the AI phone receptionist for ${ctx.orgName}. This is a LIVE phone call — speak naturally, keep every reply to 1–3 short sentences, no lists or markdown, and ask only one question at a time.${ctx.agentName ? ` If the caller asks your name, you're ${ctx.agentName}.` : ""}

Today is ${ctx.todayLabel} (${ctx.todayISO}, timezone ${ctx.timezone}). Convert relative dates like "tomorrow" or "next Tuesday" to YYYY-MM-DD yourself.

Business hours:
${ctx.hoursText}

Appointment types you can book:
${ctx.typesText}

What you know about ${ctx.orgName} — answer the caller's questions ONLY from this:
${ctx.knowledgeText || "(no knowledge base yet — if you don't know the answer, take a message instead of guessing)"}

About the business:
${fillPlaceholders(ctx.extraNotes, ctx) || "(none)"}
${ctx.callerNumber ? `\nCallback number — ALWAYS confirm it: this caller is phoning from ${ctx.callerNumber}. Before you take a message or end the call, confirm how to reach them: ask "Is ${ctx.callerNumber} the best number to call you back, or is there a better one?" If they want a different number, read it back digit by digit and get a clear "yes" before you save it. Never record a callback number you haven't read back and confirmed out loud.\n` : ""}${ctx.knownCaller ? `\nReturning caller — you RECOGNIZE this phone number, so treat them as someone you already know${ctx.knownCaller.name ? `; our records show this is ${ctx.knownCaller.name}` : ""}. Your opening line already asked them to confirm who they are — do NOT act like it's a brand-new caller and do NOT introduce yourself again.${ctx.knownCaller.summary ? ` Here's what we already have on file for them: ${ctx.knownCaller.summary}. Treat every one of these as already known — do NOT ask for them again from scratch. Instead, briefly CONFIRM and ask only what has changed, e.g. "Last time you were looking in <area> around <budget> — is that still what you're after, or has anything changed?" Only collect details that are missing or that they tell you are different.` : ` Ask only what this call needs — don't re-collect basics you would normally gather on a first call.`}\n` : ""}
How to behave:
- If the caller has an EMERGENCY: do not book an appointment. Take their name and phone number, tell them "I'll have someone call you right back," and use create_callback noting that it is an emergency.
- To book: call check_availability first, offer the real open times, confirm the time AND the caller's name, then call book_appointment. Always pass the date as YYYY-MM-DD and the time in Western digits (e.g. 11:00 AM), even when the conversation is in another language. Never invent times.
- Say dates and times in the CALLER'S language. The tools return them in English (e.g. "Monday, June 2 at 11 AM") — translate them when you speak: to a Chinese caller say "6月2号星期一上午11点". Never mix English words into a Chinese sentence.
- Answer the caller's questions about ${ctx.orgName} using the info above. If you don't know, do NOT guess — offer a call-back with create_callback.
- If the caller wants a person, use create_callback.
- Before you end the call, always ask if there's anything else you can help with, and WAIT for their answer. Only end after they confirm they're all set — never hang up right after answering or while they might still be speaking. Then give a warm goodbye and end the call.`;
}

/** @deprecated Use buildSystemPrompt. Kept for the interim Twilio gather/say loop. */
export function buildVoiceSystemPrompt(ctx: ReceptionistContext): string {
  return buildSystemPrompt(ctx);
}

// ─── Inbound dynamic variables (Retell) ───────────────────────────────────────────

/** Spoken opening line for a recognized caller — confirms their name (so we don't
 *  re-ask) in their known language. Falls back to a warm "welcome back" when we
 *  have the number but no name. Chinese when language==="zh", else English. */
function buildKnownCallerGreeting(ctx: ReceptionistContext): string {
  const first = firstName(ctx.knownCaller?.name);
  if (ctx.knownCaller?.language === "zh") {
    return first
      ? `${ctx.orgNameZh}，您好！我看到您用这个号码来电，请问是${first}吗？`
      : `${ctx.orgNameZh}，您好！很高兴再次接到您的来电。`;
  }
  return first
    ? `${ctx.orgName}. Hi! I see you're calling from this number — is this ${first}?`
    : `${ctx.orgName}. Hi, welcome back! How can I help you today?`;
}

/**
 * The spoken opening, in two parts.
 *
 *   1. this — a short hello in each language we speak, and nothing else.
 *   2. the account's custom greeting, delivered on the receptionist's FIRST
 *      reply, translated into whatever language the caller answered in
 *      (see FIRST_REPLY_INSTRUCTION in the system prompt).
 *
 * Splitting it this way is what makes a bilingual line work. A spoken opening has
 * to commit to a language before the caller has said a word, so any real greeting
 * up front is a guess — and the wrong guess makes half the callers feel like they
 * reached the wrong business. Three words of hello commit to nothing, and by the
 * time the actual greeting is spoken the caller has already chosen the language.
 *
 * The business name is deliberately NOT here. It belongs in part two, where it can
 * be said in the caller's own language, rather than in an English preamble bolted
 * onto a Chinese sentence.
 */
const OPENING_HELLO = "Hello, 您好, Hola";

/**
 * Part two: what the receptionist says on her first reply, once the caller's
 * language is known. The account's own greeting when it set one, otherwise this.
 *
 * The default names the business and the receptionist because part one no longer
 * does — after three words of hello the caller still doesn't know who answered.
 * A custom greeting that opens with its own introduction keeps it: it is being
 * spoken as the first real sentence of the call now, not stacked behind a
 * preamble, so "Thank you for calling X! I'm Emma." is correct rather than a
 * duplicate.
 */
function firstReplyGreeting(ctx: ReceptionistContext): string {
  const custom = fillPlaceholders(ctx.greeting || "", ctx)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (custom) return custom;
  const who = ctx.agentName?.trim();
  return `Thank you for calling ${ctx.orgName}!${who ? ` I'm ${who}.` : ""} How can I help you today? Are you thinking about buying or selling a home, or are you just looking for some information?`;
}


/**
 * Per-call dynamic variables for the Retell agent. Retell requires string→string;
 * keys are referenced as {{key}} in RETELL_AGENT_PROMPT_TEMPLATE. `org_id` lets the
 * function/webhook endpoints resolve the tenant without a second lookup.
 */
export function buildReceptionistDynamicVariables(ctx: ReceptionistContext): Record<string, string> {
  // Greeting comes from the org's "Opening greeting" field. Resolve the
  // {{agent_name}} / {{business_name}} placeholders HERE (server-side): Retell
  // sets its Welcome Message to {{greeting}} and does NOT recursively expand
  // placeholders nested inside a dynamic variable, so they must be resolved
  // before we hand the greeting over.
  //
  // For an unknown caller the spoken opening is only OPENING_HELLO — the real
  // greeting waits for the first reply, once the caller's language is known.
  // A RECOGNIZED caller is different: we already know their language, so there is
  // nothing to wait for and confirming who they are beats a generic hello.
  const greeting = ctx.knownCaller ? buildKnownCallerGreeting(ctx) : OPENING_HELLO;

  return {
    org_id: ctx.orgId,
    greeting,
    business_name: ctx.orgName,
    business_name_zh: ctx.orgNameZh,
    agent_name: ctx.agentName,
    caller_number: ctx.callerNumber || "",
    business_hours: ctx.hoursText,
    appointment_types: ctx.typesText,
    knowledge: ctx.knowledgeText || "(no knowledge base provided — take a message instead of guessing)",
    extra_notes: ctx.extraNotes || "(none)",
    timezone: ctx.timezone,
    today: ctx.todayISO,
    today_label: ctx.todayLabel,
    // Full per-business prompt — the Retell agent's prompt is just "{{system_prompt}}".
    system_prompt: buildSystemPrompt(ctx),
  };
}

// ─── Outbound calls (app-initiated) ───────────────────────────────────────────────

/** What an outbound AI call is trying to accomplish. */
export type OutboundPurpose =
  | "follow_up"
  | "appointment_reminder"
  | "survey"
  | "promo";

/** First line the AI speaks when the lead answers — bilingual (English + Chinese),
 *  disclosing it's an AI in both (compliance). The agent then continues in
 *  whichever language the contact replies in. */
export function buildOutboundGreeting(ctx: ReceptionistContext, leadName: string): string {
  const lead = leadName.trim();
  const who = ctx.agentName || "an assistant";
  const en = `Hi${lead ? ` ${lead}` : " there"}, this is ${who}, an AI assistant calling on behalf of ${ctx.orgName}. Is now a quick okay time to talk?`;
  const zh = `您好${lead}，我是${ctx.orgNameZh}的AI助理${ctx.agentName || ""}，请问现在方便讲几句话吗？`;
  return `${en} ${zh}`;
}

/** Per-purpose system prompt for an outbound call. Reuses the business's hours,
 *  services, and knowledge, reframed as a call the agent initiated. */
export function buildOutboundSystemPrompt(
  ctx: ReceptionistContext,
  opts: { leadName: string; purpose: OutboundPurpose; detail?: string }
): string {
  const lead = opts.leadName.trim() || "the customer";
  const detail = opts.detail?.trim();
  let goal: string;
  switch (opts.purpose) {
    case "appointment_reminder":
      goal = `Your goal: remind ${lead} about their upcoming appointment with ${ctx.orgName} and confirm they can still make it.${detail ? ` Their appointment is on ${detail}.` : ""} If they want to reschedule, use check_availability then book_appointment for a new time. If they want to cancel or need a person, use create_callback.`;
      break;
    case "survey":
      goal = `Your goal: on behalf of ${ctx.orgName}, ask ${lead} a couple of quick questions and capture their answers. ${detail ? `What to ask: ${detail}` : "Ask how their recent experience went and whether they would recommend you."} Keep it short and friendly, never pushy, and thank them for their time. If they raise a problem, offer a call-back with create_callback. Do not try to sell or book anything.`;
      break;
    case "promo":
      goal = `Your goal: briefly share an update from ${ctx.orgName} with ${lead}. ${detail ? `The message: ${detail}` : "Share the latest news or offer."} Keep it to a sentence or two and gauge interest. If they are interested, book a meeting with book_appointment or take their details with create_callback. If they are not interested, thank them and end politely.`;
      break;
    case "follow_up":
    default:
      goal = `Your goal: follow up with ${lead} about their interest in ${ctx.orgName}. Re-engage warmly, answer their questions, and if there is interest, book a meeting with book_appointment. If they are not interested, thank them politely and end the call.`;
      break;
  }

  return `## Outbound call — YOU placed this call
You are ${ctx.agentName ? `${ctx.agentName}, ` : ""}an AI assistant calling on behalf of ${ctx.orgName}. This is a LIVE outbound call that you initiated, and your opening line already greeted them and disclosed that you are an AI.

After they respond, first make sure it is a good time. If it is a bad time, apologize, offer to call back later with create_callback, and end the call. Never be pushy and never repeat yourself.

${goal}

Today is ${ctx.todayLabel} (${ctx.todayISO}, timezone ${ctx.timezone}). Convert relative dates like "tomorrow" or "next Tuesday" to YYYY-MM-DD yourself.

Business hours:
${ctx.hoursText}

Appointment types you can book:
${ctx.typesText}

What you know about ${ctx.orgName} — answer questions ONLY from this:
${ctx.knowledgeText || "(no knowledge base yet — if you don't know, offer a call-back instead of guessing)"}

About the business:
${fillPlaceholders(ctx.extraNotes, ctx) || "(none)"}

How to behave:
- Keep every reply to one or two short sentences, one question at a time. Speak in whichever language the caller uses, and switch if they switch.${ctx.orgNameZh !== ctx.orgName ? ` When you speak Chinese, call the business "${ctx.orgNameZh}".` : ""}
- To book or reschedule: call check_availability first, offer the real open times, confirm the time AND their name, then call book_appointment. Always pass dates as YYYY-MM-DD and times in Western digits (e.g. 11:00 AM).
- Say dates and times in the CALLER'S language. The tools return them in English (e.g. "Monday, June 2 at 11 AM") — translate them when you speak: to a Chinese caller say "6月2号星期一上午11点". Never mix English words into a Chinese sentence.
- Never invent times or facts. If unsure, or they want a person, use create_callback.
- Before you end the call, ask if there's anything else you can help with, and WAIT for their answer. Only end once they confirm they're done — don't hang up the moment you finish a sentence. Then thank them warmly and end the call.`;
}

/** Dynamic variables for an outbound call: the inbound set with the greeting and
 *  system prompt swapped for the outbound versions, plus lead context. */
export function buildOutboundDynamicVariables(
  ctx: ReceptionistContext,
  opts: { leadName: string; purpose: OutboundPurpose; detail?: string }
): Record<string, string> {
  return {
    ...buildReceptionistDynamicVariables(ctx),
    greeting: buildOutboundGreeting(ctx, opts.leadName),
    system_prompt: buildOutboundSystemPrompt(ctx, opts),
    lead_name: opts.leadName || "",
    call_purpose: opts.purpose,
  };
}

/**
 * The prompt to paste into the Retell agent (single-prompt mode). It mirrors the
 * interim prompt but uses Retell {{dynamic_variables}} and Retell's built-in
 * end_call tool. check_availability / book_appointment / create_callback are
 * custom functions pointed at /api/retell/function.
 */
export const RETELL_AGENT_PROMPT_TEMPLATE = `You are the AI phone receptionist for {{business_name}}. This is a LIVE phone call — speak naturally, keep every reply to 1–3 short sentences, no lists, and ask only one question at a time.

Today is {{today_label}} ({{today}}, timezone {{timezone}}). Convert relative dates like "tomorrow" or "next Tuesday" to YYYY-MM-DD yourself.

Business hours:
{{business_hours}}

Appointment types you can book:
{{appointment_types}}

What you know about {{business_name}} — answer ONLY from this:
{{knowledge}}

Additional notes:
{{extra_notes}}

How to behave:
- To book: call check_availability first, offer the real open times, confirm the time AND the caller's name, then call book_appointment with the exact start from check_availability. Never invent times.
- If you don't know the answer, do NOT guess — offer a call-back and use create_callback.
- If the caller wants a person, use create_callback.
- Before you end the call, always ask if there's anything else you can help with, and WAIT for their answer. Only end after they confirm they're all set — never hang up right after answering or while they might still be speaking. Then give a warm goodbye and end the call.`;
