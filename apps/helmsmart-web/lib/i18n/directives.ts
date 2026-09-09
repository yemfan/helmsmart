/**
 * The language HelmSmart's AI employees write back in.
 *
 * Tim's briefing, Ask, the client brief and the weekly insights all answered
 * in English no matter what language the app was in. Nothing was wrong with
 * the model — the system prompt simply never said which language the person
 * reading it speaks. This appends that sentence, for the OWNER's text only.
 *
 * THE SPLIT. An AI employee writes two kinds of text: what the owner reads
 * (the UI locale, from a cookie or `userUiLocale`) and what goes to a
 * CUSTOMER (their `preferred_language`, which `lib/language.ts` already
 * resolves per contact). A Chinese-speaking owner with English-speaking
 * customers must never have a reply flipped into Chinese because the
 * dashboard is in Chinese. So: append one of these to an owner-facing
 * generator, and nothing to a customer-facing one.
 *
 * Deterministic per locale, so the system prompt stays one cached prefix per
 * language (see lib/promptCache.ts).
 */
import { makeLanguageDirectives } from "@leadsmart/i18n";

export const {
  languageDirective,
  languageDirectiveForJson,
  languageDirectiveForMixedJson,
  languageDirectiveForExtraction,
} = makeLanguageDirectives({
  reader: "the business owner",
  readerSurfaces: "your replies, your summaries, your headlines, and every note or recommendation",
  recipient: "customer",
  recipientResolver: "which the messaging code already resolves per customer",
});
