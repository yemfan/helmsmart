import { describe, expect, it } from "vitest";
import { contactSmsNumber, toE164 } from "../smsNumber";

describe("contactSmsNumber", () => {
  it("normalises whatever shape the number was stored in", () => {
    expect(contactSmsNumber({ phone: "(626) 625-5055" })).toBe("+16266255055");
    expect(contactSmsNumber({ phone: "+16265550166" })).toBe("+16265550166");
  });

  it("treats a blank as no number rather than as an answer", () => {
    expect(contactSmsNumber({ phone: "   " })).toBeNull();
  });

  it("reports honestly when there is genuinely no number", () => {
    expect(contactSmsNumber({ phone: null })).toBeNull();
    expect(contactSmsNumber({})).toBeNull();
    expect(contactSmsNumber(null)).toBeNull();
  });
});

describe("toE164", () => {
  it("normalises the shapes actually in the table", () => {
    expect(toE164("(626) 625-5055")).toBe("+16266255055");
    expect(toE164("+16265550166")).toBe("+16265550166");
    expect(toE164("626-625-5055")).toBe("+16266255055");
    expect(toE164("16265550166")).toBe("+16265550166");
  });

  it("passes an international number through instead of dropping it", () => {
    // Better to let the provider judge it than to decide it does not exist.
    expect(toE164("+442071234567")).toBe("+442071234567");
  });

  it("returns something falsy for nothing", () => {
    expect(toE164("")).toBe("");
    expect(toE164("   ")).toBe("");
  });
});
