/**
 * The language Max writes back in.
 *
 * The rule — "the AI writes in the language the READER speaks, and never
 * translates a message bound for their CONTACT because of it" — lives in the
 * shared package now, so HelmSmart's AI employees follow the same split. This
 * module binds it to CloseBoss's wording: the reader is the realtor, and what
 * they read from Max is the plan, the headline and the mission report.
 *
 * The bound wording is the package default, verbatim, so every prompt here
 * is byte-identical to what it was — and therefore so is every prompt-cache
 * prefix.
 *
 * Pair it with `agentUiLocale()` when there is no request to read a cookie
 * from — a cron has no cookies, and defaulting those to English is how a
 * Chinese-speaking agent ends up with an English dashboard full of English
 * task cards.
 */
import { LANGUAGE_NAMES, makeLanguageDirectives } from "@leadsmart/i18n";

export { LANGUAGE_NAMES };

export const {
  languageDirective,
  languageDirectiveForJson,
  languageDirectiveForMixedJson,
  languageDirectiveForExtraction,
} = makeLanguageDirectives();
