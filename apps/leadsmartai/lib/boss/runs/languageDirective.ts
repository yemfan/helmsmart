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
