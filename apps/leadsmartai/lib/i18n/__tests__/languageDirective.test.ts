import { describe, expect, it } from "vitest";

import {
  LANGUAGE_NAMES,
  languageDirective,
  languageDirectiveForJson,
  languageDirectiveForExtraction,
  languageDirectiveForMixedJson,
} from "../languageDirective";

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

describe("languageDirectiveForJson", () => {
  /**
   * Most of these generators end their prompt with "return the JSON", and their
   * caller parses the result by field name. "Write everything the reader sees in
   * Chinese" is, read literally, also an instruction to rename `"headline"` to
   * `"标题"` — after which the parser finds none of its fields and the feature
   * returns nothing at all.
   *
   * That failure is silent, total, and visible in one locale only, so the rule
   * separating the wire format from the copy is asserted rather than trusted.
   */
  it("stays empty for English, like the base directive", () => {
    expect(languageDirectiveForJson("en")).toBe("");
    expect(languageDirectiveForJson(null)).toBe("");
  });

  it("keeps the whole base directive, including the contact-language split", () => {
    const json = languageDirectiveForJson("zh-Hans");
    expect(json.startsWith(languageDirective("zh-Hans"))).toBe(true);
    // The split is the part that must survive: an agent reading Chinese must
    // not start sending Chinese SMS to English-speaking buyers.
    expect(json).toContain("contact");
  });

  it("tells the model the schema is not copy", () => {
    const json = languageDirectiveForJson("zh-Hans");
    expect(json).toMatch(/key/i);
    expect(json).toMatch(/translate only the human-readable string values/i);
  });

  it("is deterministic, so it does not break the cached prefix", () => {
    expect(languageDirectiveForJson("zh-Hans")).toBe(languageDirectiveForJson("zh-Hans"));
  });
});

describe("languageDirectiveForMixedJson", () => {
  /**
   * One response, two readers. `maxReview` returns Max's `reason` for the
   * realtor beside the corrected `body` that is sent to their CONTACT; the
   * skills compliance gate returns an `issue` beside a `rewrite` of public
   * copy.
   *
   * Neither of the other two directives can express that, and getting it
   * wrong is not a cosmetic bug: it sends a Chinese SMS to an English-speaking
   * buyer under the agent's own name. That is worse than the English-in-a-
   * Chinese-dashboard problem this whole effort exists to fix, so the boundary
   * is asserted.
   */
  const mixed = (loc: string | null) =>
    languageDirectiveForMixedJson(loc, {
      agentReads: ["reason"],
      recipientReads: ["body"],
    });

  it("says nothing for English", () => {
    expect(mixed("en")).toBe("");
    expect(mixed(null)).toBe("");
  });

  it("names the agent's field as the one to translate", () => {
    const d = mixed("zh-Hans");
    expect(d).toContain('"reason"');
    expect(d).toContain(LANGUAGE_NAMES["zh-Hans"]);
  });

  it("names the recipient's field as the one to leave alone", () => {
    const d = mixed("zh-Hans");
    expect(d).toContain('"body"');
    // The reason has to travel with the rule: a model that knows WHY `body`
    // stays put handles the field this list did not anticipate.
    expect(d).toMatch(/sent to a CONTACT/i);
    expect(d).toMatch(/cannot read/i);
  });

  it("still protects the schema itself", () => {
    expect(mixed("zh-Hans")).toMatch(/keep every key/i);
  });

  it("is deterministic, so the cached prefix survives", () => {
    expect(mixed("zh-Hans")).toBe(mixed("zh-Hans"));
  });
});

describe("languageDirectiveForExtraction", () => {
  /**
   * An extractor's response is mostly DATA pulled out of a document — an
   * address, a purchase price, buyer names. Translating one corrupts the
   * record: a `propertyAddress` rendered into Chinese no longer matches the
   * property, and `buyerNames` no longer matches the people.
   *
   * The same response also carries a little prose written for the agent —
   * `warnings` ("ambiguous date — 'next week' was used") and `notes` — which
   * render straight onto the dashboard beside a translated label. Those were
   * the only English left in an otherwise structured payload.
   *
   * So this helper's emphasis is the opposite of the others: it names the
   * prose and defends everything else, and the defending half is what these
   * cases pin.
   */
  const ex = (loc: string | null) => languageDirectiveForExtraction(loc, ["notes", "warnings"]);

  it("says nothing for English", () => {
    expect(ex("en")).toBe("");
    expect(ex(null)).toBe("");
  });

  it("names the prose fields it may translate", () => {
    expect(ex("zh-Hans")).toContain('"notes"');
    expect(ex("zh-Hans")).toContain('"warnings"');
  });

  it("forbids touching the extracted data, by category", () => {
    const d = ex("zh-Hans");
    // Named individually, because "everything else" alone invites a model to
    // decide an address is prose.
    for (const kind of ["names", "addresses", "dates", "amounts"]) {
      expect(d, kind).toContain(kind);
    }
    expect(d).toMatch(/never translated, transliterated or reformatted/i);
  });

  it("holds even when the document is in another language", () => {
    expect(ex("zh-Hans")).toMatch(/whatever language the document is in/i);
  });

  it("is deterministic", () => {
    expect(ex("zh-Hans")).toBe(ex("zh-Hans"));
  });
});
