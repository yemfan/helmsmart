import { describe, it, expect } from "vitest";
import { connectErrorMessage } from "./connect-error";

describe("connectErrorMessage — friendly, accurate social connect errors", () => {
  it("never dumps a raw provider blob and always names the provider", () => {
    for (const code of ["not_configured", "bad_state", "token_exchange_failed", "access_denied", "weird_unknown_1349245"]) {
      const msg = connectErrorMessage("Threads", code);
      expect(msg).toContain("Threads");
      expect(msg).not.toMatch(/\{|\}|error_code|error_message/); // no raw JSON leakage
      expect(msg.length).toBeGreaterThan(20);
    }
  });

  it("does NOT tell the user to retry when a retry can't help (config error)", () => {
    const msg = connectErrorMessage("YouTube", "not_configured").toLowerCase();
    expect(msg).toContain("isn't set up");
    expect(msg).toContain("retrying won't help");
    expect(msg).not.toContain("try again");
  });

  it("guides the user to reconnect for transient/expired states", () => {
    expect(connectErrorMessage("LinkedIn", "bad_state")).toMatch(/start Connect LinkedIn again/i);
    expect(connectErrorMessage("Facebook", "token_exchange_failed")).toMatch(/try connecting again/i);
  });

  it("explains cancellation / missing permissions on access_denied", () => {
    const msg = connectErrorMessage("TikTok", "access_denied");
    expect(msg).toMatch(/cancelled|permission/i);
  });

  it("unknown codes get a helpful generic message (approval / tester hint), still friendly", () => {
    const msg = connectErrorMessage("Threads", "1349245");
    expect(msg).toMatch(/approval|tester/i);
    expect(msg).toContain("Threads");
  });
});
