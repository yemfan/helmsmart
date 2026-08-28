import { describe, expect, it } from "vitest";
import { dispatchOutcomeMessage } from "../dispatchMessage";

describe("dispatchOutcomeMessage", () => {
  it("explains the hold that this session found on screen", () => {
    // The screen used to read "Deferred: paused_on_reply".
    const msg = dispatchOutcomeMessage("paused_on_reply");
    expect(msg).not.toMatch(/paused_on_reply/);
    expect(msg).toMatch(/written to you recently/);
  });

  it("never shows a raw outcome code for a reason we know", () => {
    const known = [
      "sent",
      "paused_on_reply",
      "quiet_hours",
      "sunday_morning",
      "chinese_new_year",
      "per_contact_cap",
      "do_not_contact",
      "missing_address",
      "stale",
    ] as const;
    for (const reason of known) {
      expect(dispatchOutcomeMessage(reason), reason).not.toMatch(/_/);
    }
  });

  it("does not invite a retry that cannot help", () => {
    // An opt-out, a missing number and a stale draft all need a different
    // action, not another click.
    for (const reason of ["do_not_contact", "missing_address", "stale"] as const) {
      expect(dispatchOutcomeMessage(reason), reason).not.toMatch(/try again/i);
    }
  });

  it("says what to do where there is something to do", () => {
    expect(dispatchOutcomeMessage("missing_address")).toMatch(/Add one/);
    expect(dispatchOutcomeMessage("stale")).toMatch(/Redraft/);
  });

  it("passes a provider failure through", () => {
    expect(dispatchOutcomeMessage("send_failed", "Twilio rejected the number")).toBe(
      "Could not send: Twilio rejected the number",
    );
    expect(dispatchOutcomeMessage("send_failed")).toBe("Could not send.");
  });

  it("shows an unfamiliar reason rather than going quiet", () => {
    expect(dispatchOutcomeMessage("something_new")).toBe("Not sent (something_new).");
    expect(dispatchOutcomeMessage(undefined)).toBe("Nothing to send.");
  });
});
