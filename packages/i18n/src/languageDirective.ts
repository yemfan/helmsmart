/**
 * The language an AI writes back in.
 *
 * Ask Max answered in English no matter what language the app was in. An agent
 * could run the whole dashboard in Chinese, type their command in Chinese, and
 * get the mission report back in English. Nothing was wrong with the model —
 * Claude is multilingual and always was — the system prompt simply never said
 * which language the person reading it speaks.
 *
 * THE SPLIT IS THE POINT. An AI employee writes two kinds of text:
 *
 *   - the report the OWNER reads — their language, which is the UI locale;
 *   - through tools, messages that go out to their CONTACTS — the contact's
 *     language, which each app already decides per contact.
 *
 * A directive that said only "reply in Chinese" would collapse those two. A
 * Chinese-speaking owner with English-speaking customers would start sending
 * Chinese SMS to those customers, which is a worse bug than the one being
 * fixed: the first is an inconvenience to one person who can read both, the
 * second is an unreadable message sent to a client under the owner's name.
 *
 * Pure and free of `server-only` so the rule can be tested directly.
 *
 * PER-APP WORDING. The reader is "the realtor" in CloseBoss and "the business
 * owner" in HelmSmart, and what they read differs ("the final mission report"
 * is Max's). `makeLanguageDirectives` takes those nouns once; each app exports
 * the bound functions. The default wording is CloseBoss's, verbatim, so its
 * prompts — and therefore its prompt-cache prefixes — do not change.
 */

/**
 * i18next locale id → the language's name.
 *
 * Written in the language itself, with the English name alongside. The model
 * reads the prompt in English and the endonym removes any doubt about which
 * script is meant — "Chinese" alone does not distinguish 简体 from 繁體.
 *
 * Absent from this map means "write in English", which is why `en` is not a
 * key: the base prompt is already English, and a directive telling it to be
 * English is prompt weight that buys nothing.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  "zh-Hans": "简体中文 (Simplified Chinese)",
  es: "Español (Spanish)",
};

export type DirectiveWording = {
  /** "the realtor", "the business owner" */
  reader: string;
  /** What the reader sees from this generator. CloseBoss: Max's run outputs. */
  readerSurfaces: string;
  /** "contact", "customer" — lower case, used mid-sentence. */
  recipient: string;
  /** The tools that already resolve the recipient's language. */
  recipientResolver: string;
};

const CLOSEBOSS_WORDING: DirectiveWording = {
  reader: "the realtor",
  readerSurfaces: "your replies, your plan, your headline, and the final mission report",
  recipient: "contact",
  recipientResolver: "which the messaging tools already resolve",
};

export type LanguageDirectives = {
  languageDirective: (locale: string | null | undefined) => string;
  languageDirectiveForJson: (locale: string | null | undefined) => string;
  languageDirectiveForMixedJson: (
    locale: string | null | undefined,
    fields: { agentReads: string[]; recipientReads: string[] },
  ) => string;
  languageDirectiveForExtraction: (
    locale: string | null | undefined,
    proseFields: string[],
  ) => string;
};

export function makeLanguageDirectives(
  wording: Partial<DirectiveWording> = {},
): LanguageDirectives {
  const w: DirectiveWording = { ...CLOSEBOSS_WORDING, ...wording };
  const RECIPIENT = w.recipient.toUpperCase();

  /**
   * The paragraph appended to the system prompt, or "" for English.
   *
   * Deterministic per locale on purpose: the system prompt is a cache
   * breakpoint, so a stable string means one cached prefix per language rather
   * than a cache miss on every run.
   */
  function languageDirective(locale: string | null | undefined): string {
    const name = LANGUAGE_NAMES[locale ?? ""];
    if (!name) return "";
    return `

Language — ${w.reader} reads ${name}. Write everything they read in ${name}: ${w.readerSurfaces}. Keep tool names, links, and proper nouns as they are.
This is about THEIR language, not their ${w.recipient}s'. Text destined for a ${w.recipient} — an SMS body, an email, a post caption — follows that ${w.recipient}'s own preferred language, ${w.recipientResolver}. Never translate a client-facing message into ${name} just because the dashboard is in ${name}.`;
  }

  /**
   * The same rule for a generator whose output is PARSED, not printed.
   *
   * Most of these prompts end in "return the JSON". Telling a model to write
   * everything the reader sees in Chinese is, read literally, also an
   * instruction to translate `"headline"` into `"标题"` — and the parser then
   * finds none of its fields and the feature returns nothing. The failure is
   * silent and total, and it only shows up in the one locale.
   *
   * So the JSON variant says which half is which: keys and enum values are a
   * wire format, the human-readable strings inside them are copy.
   */
  function languageDirectiveForJson(locale: string | null | undefined): string {
    const base = languageDirective(locale);
    if (!base) return "";
    return `${base}
JSON shape is NOT copy. Keep every key, and every enumerated value the schema fixes (status codes, severities, types), EXACTLY as the schema specifies them in English. Translate only the human-readable string values a person reads.`;
  }

  /**
   * For one response that carries BOTH halves of the split: a `reason` the
   * owner reads beside a `body` that goes to their contact. Neither directive
   * above can express that, so the fields are named, and the reason each one
   * is named is in the prompt — a model that knows WHY `body` stays put
   * handles the case the field list didn't anticipate.
   */
  function languageDirectiveForMixedJson(
    locale: string | null | undefined,
    fields: { agentReads: string[]; recipientReads: string[] },
  ): string {
    const name = LANGUAGE_NAMES[locale ?? ""];
    if (!name) return "";
    const agent = fields.agentReads.map((f) => `"${f}"`).join(", ");
    const recipient = fields.recipientReads.map((f) => `"${f}"`).join(", ");
    return `

Language — ${w.reader} reads ${name}, and this one response carries text for two different readers.
Write ${agent} in ${name}: that is you talking to ${w.reader}.
Leave ${recipient} in the language of the message it belongs to. That text is sent to a ${RECIPIENT} under ${w.reader}'s name, so translating it because the dashboard is in ${name} would deliver a message the recipient cannot read.
Keep every key, and every fixed enum value the schema lists, exactly as specified in English.`;
  }

  /**
   * For an EXTRACTOR: most of what it returns was lifted from a document.
   * Those values are data, and translating one corrupts it. The same responses
   * also carry a little prose written FOR the reader — `warnings`, `notes` —
   * rendered straight onto the dashboard beside a translated label. So this
   * names the prose and defends everything else.
   */
  function languageDirectiveForExtraction(
    locale: string | null | undefined,
    proseFields: string[],
  ): string {
    const name = LANGUAGE_NAMES[locale ?? ""];
    if (!name) return "";
    const prose = proseFields.map((f) => `"${f}"`).join(" and ");
    return `

Language — ${w.reader} reads ${name}. Write ${prose} in ${name}: those are your own words to them.
Everything else in the response is DATA you extracted from the document. Reproduce it exactly as it appears there — names, addresses, cities, dates, amounts and identifiers are never translated, transliterated or reformatted, whatever language the document is in. Keep every key exactly as the schema specifies.`;
  }

  return {
    languageDirective,
    languageDirectiveForJson,
    languageDirectiveForMixedJson,
    languageDirectiveForExtraction,
  };
}
