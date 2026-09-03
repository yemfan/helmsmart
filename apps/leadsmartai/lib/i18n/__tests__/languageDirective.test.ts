import { describe, expect, it } from "vitest";

import { LANGUAGE_NAMES, languageDirective } from "../languageDirective";

/**
 * The directive that makes Max answer in the realtor's language.
 *
 * The risk being guarded is not "does it mention Chinese" — a one-line prompt
 * edit does that. It is the SPLIT: Max writes the report the realtor reads AND,
 * through tools, the messages that go to their contacts. Only the first follows
 * the dashboard's language.
 *
 * Get that wrong and a Chinese-speaking agent with English-speaking buyers
 * starts sending Chinese SMS to those buyers under their own name. That failure
 * is worse than the bug this fixes and would be invisible in the dashboard,
 * which is why it is asserted here rather than left to review.
 */
describe("languageDirective", () => {
  it("says nothing for English", () => {
    // The base prompt is already English. A paragraph instructing it to be
    // English is prompt weight, and weight on a cached prefix is paid for on
    // every run.
    expect(languageDirective(null)).toBe("");
    expect(languageDirective(undefined)).toBe("");
    expect(languageDirective("en")).toBe("");
  });

  it("says nothing for a locale it has no name for", () => {
    // Better silent than asking the model to write in a language named by a
    // BCP-47 tag it may or may not resolve. Adding a locale to the app means
    // adding it to LANGUAGE_NAMES deliberately.
    expect(languageDirective("fr")).toBe("");
    expect(languageDirective("zh-Hant")).toBe("");
  });

  it("names the language for a locale it knows", () => {
    const out = languageDirective("zh-Hans");
    expect(out).toContain("简体中文");
    // The endonym alone is ambiguous to a prompt read in English; the English
    // name pins the script.
    expect(out).toContain("Simplified Chinese");
  });

  it("scopes the language to the realtor, not to their contacts", () => {
    const out = languageDirective("zh-Hans");
    expect(out).toContain("mission report");
    // The load-bearing sentence. If this ever drops out, client-facing SMS
    // starts inheriting the dashboard's language.
    expect(out).toMatch(/contact's own preferred language/);
    expect(out).toMatch(/Never translate a client-facing message/);
  });

  it("is byte-identical for the same locale", () => {
    // The system prompt is a cache breakpoint. Anything non-deterministic here
    // — a date, a shuffle — turns every run into a cache miss and undoes the
    // ~48% saving that caching bought.
    expect(languageDirective("zh-Hans")).toBe(languageDirective("zh-Hans"));
  });

  it("has no entry for English in the name table", () => {
    expect(LANGUAGE_NAMES).not.toHaveProperty("en");
  });
});
