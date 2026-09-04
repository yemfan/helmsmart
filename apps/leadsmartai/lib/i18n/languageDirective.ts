/**
 * The language Max writes back in.
 *
 * Ask Max answered in English no matter what language the app was in. An agent
 * could run the whole dashboard in Chinese, type their command in Chinese, and
 * get the mission report back in English. Nothing was wrong with the model —
 * Claude is multilingual and always was — the system prompt simply never said
 * which language the person reading it speaks. Same shape as the avatar-script
 * bug: the capability was there, the prompt was English-locked.
 *
 * THE SPLIT IS THE POINT. Max writes two kinds of text:
 *
 *   - the report the REALTOR reads — their language, which is the UI locale;
 *   - through tools, messages that go out to their CONTACTS — the contact's
 *     language, which `lib/locales/resolveLocale` already decides per contact.
 *
 * A directive that said only "reply in Chinese" would collapse those two. A
 * Chinese-speaking agent with English-speaking buyers would start sending
 * Chinese SMS to those buyers, which is a worse bug than the one being fixed:
 * the first is an inconvenience to one person who can read both, the second is
 * an unreadable message sent to a client under the agent's name.
 *
 * Pure and free of `server-only` so the rule can be tested directly — the same
 * reason `tokenAccounting.ts` sits beside `service.ts` rather than inside it.
 *
 * Lives under `lib/i18n` rather than beside the Boss run that first needed it:
 * "the AI writes in the language the reader speaks" is not a Boss-run detail,
 * and every generator that reaches an agent's screen wants the same paragraph.
 * Pair it with `agentUiLocale()` when there is no request to read a cookie
 * from — a cron has no cookies, and defaulting those to English is how a
 * Chinese-speaking agent ends up with an English dashboard full of English
 * task cards.
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
};

/**
 * The paragraph appended to the system prompt, or "" for English.
 *
 * Deterministic per locale on purpose: the system prompt is a cache breakpoint,
 * so a stable string means one cached prefix per language rather than a cache
 * miss on every run.
 */
export function languageDirective(locale: string | null | undefined): string {
  const name = LANGUAGE_NAMES[locale ?? ""];
  if (!name) return "";
  return `

Language — the realtor reads ${name}. Write everything they read in ${name}: your replies, your plan, your headline, and the final mission report. Keep tool names, links, and proper nouns as they are.
This is about THEIR language, not their contacts'. Text destined for a contact — an SMS body, an email, a post caption — follows that contact's own preferred language, which the messaging tools already resolve. Never translate a client-facing message into ${name} just because the dashboard is in ${name}.`;
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
export function languageDirectiveForJson(locale: string | null | undefined): string {
  const base = languageDirective(locale);
  if (!base) return "";
  return `${base}
JSON shape is NOT copy. Keep every key, and every enumerated value the schema fixes (status codes, severities, types), EXACTLY as the schema specifies them in English. Translate only the human-readable string values a person reads.`;
}

/**
 * For one response that carries BOTH halves of the split.
 *
 * `maxReview` returns `{ verdict, body, reason }`: `reason` is Max explaining
 * himself to the realtor, and `body` is the corrected message that goes to
 * their CONTACT. The compliance gate in `skills/run` has the same shape — an
 * `issue` for the realtor beside a `rewrite` of public copy.
 *
 * Neither directive above can express that. `languageDirective` would put the
 * outbound message into the realtor's language, which is the failure it exists
 * to prevent, and the JSON variant would do the same to every string value. So
 * the fields are named, and the reason each one is named is in the prompt —
 * a model that knows WHY `body` stays put handles the case the field list
 * didn't anticipate.
 */
export function languageDirectiveForMixedJson(
  locale: string | null | undefined,
  fields: { agentReads: string[]; recipientReads: string[] },
): string {
  const name = LANGUAGE_NAMES[locale ?? ""];
  if (!name) return "";
  const agent = fields.agentReads.map((f) => `"${f}"`).join(", ");
  const recipient = fields.recipientReads.map((f) => `"${f}"`).join(", ");
  return `

Language — the realtor reads ${name}, and this one response carries text for two different readers.
Write ${agent} in ${name}: that is you talking to the realtor.
Leave ${recipient} in the language of the message it belongs to. That text is sent to a CONTACT under the realtor's name, so translating it because the dashboard is in ${name} would deliver a message the recipient cannot read.
Keep every key, and every fixed enum value the schema lists, exactly as specified in English.`;
}

/**
 * For an EXTRACTOR: most of what it returns was lifted from a document.
 *
 * These prompts pull structured facts out of a PDF or an email — an address,
 * a purchase price, buyer names, a requested date. Those values are data, and
 * translating one corrupts it: a contract's `propertyAddress` rendered into
 * Chinese no longer matches the property, and `buyerNames` no longer matches
 * the people.
 *
 * But the same responses also carry a little prose written FOR the agent —
 * `warnings` ("ambiguous date — 'next week' was used") and `notes`
 * ("free-form context the agent should know"). Those are rendered straight
 * onto the dashboard beside a translated label, so they are copy, and they
 * were the only English left in an otherwise structured payload.
 *
 * So this names the prose and defends everything else, which is the opposite
 * emphasis from the other three helpers.
 */
export function languageDirectiveForExtraction(
  locale: string | null | undefined,
  proseFields: string[],
): string {
  const name = LANGUAGE_NAMES[locale ?? ""];
  if (!name) return "";
  const prose = proseFields.map((f) => `"${f}"`).join(" and ");
  return `

Language — the realtor reads ${name}. Write ${prose} in ${name}: those are your own words to them.
Everything else in the response is DATA you extracted from the document. Reproduce it exactly as it appears there — names, addresses, cities, dates, amounts and identifiers are never translated, transliterated or reformatted, whatever language the document is in. Keep every key exactly as the schema specifies.`;
}
