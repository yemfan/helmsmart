import { describe, expect, it } from "vitest";

import { canEmailThread } from "../replyTarget";

/**
 * The rule that keeps a reply from reaching the wrong person.
 *
 * This is not a formatting nicety. The failure it prevents is an email sent
 * under the agent's own name, to a contact who was not part of the
 * conversation, with the agent's screen showing the correct thread throughout.
 * There is no way for anyone to notice from inside the app.
 */
describe("canEmailThread", () => {
  const jordan = { id: "lead-jordan", email: "jordan@example.com" };
  const marcus = { id: "lead-marcus", email: "marcus@example.com" };

  it("allows a reply when the loaded contact IS the selected thread", () => {
    expect(canEmailThread(jordan, "lead-jordan")).toBe(true);
  });

  it("refuses when the loaded contact is a DIFFERENT person", () => {
    // The whole reason this function exists: Marcus is selected, but Marcus's
    // thread fetch failed and Jordan is still in state.
    expect(canEmailThread(jordan, "lead-marcus")).toBe(false);
  });

  it("refuses when no contact is loaded", () => {
    expect(canEmailThread(null, "lead-marcus")).toBe(false);
  });

  it("refuses when no thread is selected", () => {
    expect(canEmailThread(jordan, null)).toBe(false);
  });

  it("refuses a contact with no address, even when identity matches", () => {
    expect(canEmailThread({ id: "lead-x", email: null }, "lead-x")).toBe(false);
    expect(canEmailThread({ id: "lead-x", email: "" }, "lead-x")).toBe(false);
    // Whitespace is not an address; sending here would fail at the provider
    // with a message the agent cannot act on.
    expect(canEmailThread({ id: "lead-x", email: "   " }, "lead-x")).toBe(false);
  });

  it("checks identity before the address", () => {
    // A mismatched contact WITH a valid address is the dangerous case — the
    // send would succeed, which is precisely why it must be refused.
    expect(canEmailThread(marcus, "lead-jordan")).toBe(false);
  });
});
