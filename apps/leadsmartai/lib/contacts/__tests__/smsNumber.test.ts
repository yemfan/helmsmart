import { describe, expect, it } from "vitest";
import { contactSmsNumber, toE164 } from "../smsNumber";

describe("contactSmsNumber", () => {
  it("finds the number when only phone_number is filled in", () => {
    // The regression: the draft sender failed Sofia Marin and David Kim for
    // "no phone number" while +16265550166 sat in the column it did not read.
    expect(contactSmsNumber({ phone: null, phone_number: "+16265550166" })).toBe(
      "+16265550166",
    );
  });

  it("finds the number when only phone is filled in", () => {
    expect(contactSmsNumber({ phone: "(626) 625-5055", phone_number: null })).toBe(
      "+16266255055",
    );
  });

  it("prefers phone, the column a person types into", () => {
    expect(
      contactSmsNumber({ phone: "(626) 111-2222", phone_number: "+16263334444" }),
    ).toBe("+16261112222");
  });

  it("skips a blank column rather than treating it as an answer", () => {
    expect(contactSmsNumber({ phone: "   ", phone_number: "+16265550166" })).toBe(
      "+16265550166",
    );
  });

  it("reports honestly when there is genuinely no number", () => {
    expect(contactSmsNumber({ phone: null, phone_number: null })).toBeNull();
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
