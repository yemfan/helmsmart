/**
 * Typing a number wires nothing — so the screen must not say it did.
 *
 * `saveTwilioNumber` writes `organizations.twilio_number` and stops there. It
 * buys nothing, attaches nothing to the receptionist agent and points no
 * webhook here. That is fine — some accounts share one line that somebody else
 * already wired — and it is exactly why the save cannot be allowed to read as
 * finished: for a year the owner typed a number, the app looked configured, and
 * every call to it went nowhere.
 *
 * These tests pin both halves of the fix:
 *
 *  1. The typed path still reaches no provider (a source check — if someone
 *     wires it later, this file should be the thing that makes them say so).
 *  2. Whatever the provider then reports, the verdict the owner sees is honest:
 *     an unknown number reads "not answered", never "saved" and nothing more.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { translatorFor } from "@/lib/i18n/translator";
import { describeWiring } from "@/lib/voice/number-wiring";

const messagesSource = readFileSync(
  join(process.cwd(), "lib", "actions", "messages.ts"),
  "utf8"
);

describe("the typed-number escape hatch", () => {
  it("still provisions and binds nothing — it only records the column", () => {
    // If this ever fails, the typed path grew a provider call: either it now
    // wires the number (delete this test and the 'unverified' copy with it) or
    // it gained a side effect that spends money without saying so.
    expect(messagesSource).not.toMatch(/@\/lib\/retell|@repo\/voice\/retell/);
    expect(messagesSource).toMatch(/saveTwilioNumber/);
  });

  it("records only twilio_number, through the row-checked helper", () => {
    expect(messagesSource).toMatch(/updateOrg\(orgId, \{ twilio_number:/);
  });

  it("so a saved number the provider doesn't know reads as not answered", () => {
    // The state right after someone types a number that was never wired.
    const verdict = describeWiring({ ok: false, numberFound: false, webhookOk: false, agentOk: false });
    expect(verdict.state).toBe("unwired");
    expect(verdict.reasonKeys).toEqual(["wiring.reason.notInProvider"]);

    for (const locale of ["en", "es", "zh-Hans"] as const) {
      const t = translatorFor(locale, "voice");
      // The heading the save itself shows, and the reason underneath it.
      expect(t("number.savedNotAnswering")).not.toBe("number.savedNotAnswering");
      expect(t(verdict.reasonKeys[0])).not.toBe(verdict.reasonKeys[0]);
    }
  });

  it("and a check we could not run says so, rather than showing the old 'saved' line", () => {
    const verdict = describeWiring({
      ok: false,
      numberFound: false,
      webhookOk: false,
      agentOk: false,
      error: "Retell is unreachable",
    });
    expect(verdict.state).toBe("unknown");
    for (const locale of ["en", "es", "zh-Hans"] as const) {
      expect(translatorFor(locale, "voice")("number.savedNotChecked")).not.toBe("number.savedNotChecked");
    }
  });
});
