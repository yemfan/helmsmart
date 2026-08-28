import { describe, it, expect } from "vitest";
import { normalizeContactName, contactMatchesName } from "../nameMatch";

/**
 * This only ever chooses between contacts whose phone ALREADY matched, so a
 * loose rule picks the wrong person rather than merely failing to find one.
 * The failure is silent: the right name greeting the wrong record.
 */
describe("contact name matching", () => {
  it("ignores punctuation, spacing and case", () => {
    expect(normalizeContactName("Ye, Michael")).toBe(normalizeContactName("ye michael"));
    expect(normalizeContactName("  Michael   Ye ")).toBe("michaelye");
  });

  it("treats a CJK name with and without a space as the same", () => {
    // Real data: the receptionist saved "叶Michael"; a human would type "叶 Michael".
    expect(normalizeContactName("叶 Michael")).toBe(normalizeContactName("叶Michael"));
  });

  it("matches on the full name", () => {
    expect(contactMatchesName({ name: "Angel Zhao" }, "Angel Zhao")).toBe(true);
    expect(contactMatchesName({ first_name: "Angel", last_name: "Zhao" }, "angel zhao")).toBe(true);
  });

  it("matches on the first name, because that is what callers say", () => {
    expect(contactMatchesName({ name: "Michael Ye" }, "Michael")).toBe(true);
    expect(contactMatchesName({ first_name: "Michael", last_name: "Ye" }, "michael")).toBe(true);
  });

  it("does not match a different person on the same number", () => {
    // The case this exists for: two contacts, one phone.
    expect(contactMatchesName({ name: "Angel Zhao" }, "Michael")).toBe(false);
    expect(contactMatchesName({ name: "叶Michael" }, "Angel")).toBe(false);
  });

  it("does not match a surname, which is not how people introduce themselves", () => {
    expect(contactMatchesName({ first_name: "Michael", last_name: "Ye" }, "Ye")).toBe(false);
  });

  it("is false with no hint, so it falls back to newest rather than guessing", () => {
    expect(contactMatchesName({ name: "Angel Zhao" }, null)).toBe(false);
    expect(contactMatchesName({ name: "Angel Zhao" }, "")).toBe(false);
    expect(contactMatchesName({ name: "Angel Zhao" }, "   ")).toBe(false);
  });

  it("is false for a contact with no name at all", () => {
    expect(contactMatchesName({}, "Michael")).toBe(false);
    expect(contactMatchesName({ name: null }, "Michael")).toBe(false);
  });
});
