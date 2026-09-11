/**
 * The consent decision (`decideConsent` in @helm/dna-communication) over every
 * channel × purpose × source. The policy it encodes:
 *
 *   SMS opt-out    blocks every text, whatever the purpose
 *   call opt-out   blocks every call the product places
 *   email opt-out  blocks everything except transactional mail
 */
import { describe, expect, it } from "vitest";
import {
  CONSENT_CHANNELS,
  CONSENT_PURPOSES,
  OPT_OUT_REASON,
  decideConsent,
  optOutCovers,
  shouldStartMessaging,
  shouldStopMessaging,
  type ConsentChannel,
  type ConsentInputs,
} from "@helm/dna-communication";

const SEP_3 = "2026-09-03T15:00:00.000Z";

/** Each source, opting out of the channel it can speak for. */
const SOURCES: Record<string, { speaksFor: ConsentChannel; inputs: ConsentInputs }> = {
  "sms preference": { speaksFor: "sms", inputs: { preferences: { opted_out_sms: true } } },
  "email preference": { speaksFor: "email", inputs: { preferences: { opted_out_email: true } } },
  "call preference": { speaksFor: "call", inputs: { preferences: { opted_out_calls: true } } },
  "sms_unsubscribes row": {
    speaksFor: "sms",
    inputs: { smsUnsubscribe: { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.stopReply } },
  },
  "email_unsubscribes row": {
    speaksFor: "email",
    inputs: { emailUnsubscribe: { unsubscribed_at: SEP_3, reason: "manual" } },
  },
};

describe("decideConsent — no opt-out anywhere", () => {
  for (const channel of CONSENT_CHANNELS) {
    for (const purpose of CONSENT_PURPOSES) {
      it(`allows ${channel} / ${purpose}`, () => {
        expect(decideConsent(channel, purpose, {}).allowed).toBe(true);
        expect(
          decideConsent(channel, purpose, {
            preferences: { opted_out_sms: false, opted_out_email: false, opted_out_calls: false },
          }).allowed,
        ).toBe(true);
      });
    }
  }
});

describe("decideConsent — every channel × purpose × source", () => {
  for (const [sourceName, { speaksFor, inputs }] of Object.entries(SOURCES)) {
    for (const channel of CONSENT_CHANNELS) {
      for (const purpose of CONSENT_PURPOSES) {
        const shouldDeny = channel === speaksFor && optOutCovers(channel, purpose);
        it(`${sourceName}: ${channel} / ${purpose} → ${shouldDeny ? "denied" : "allowed"}`, () => {
          const d = decideConsent(channel, purpose, inputs);
          expect(d.allowed).toBe(!shouldDeny);
        });
      }
    }
  }
});

describe("the policy, stated", () => {
  it("an SMS opt-out blocks every purpose, transactional included", () => {
    for (const purpose of CONSENT_PURPOSES) {
      expect(decideConsent("sms", purpose, { preferences: { opted_out_sms: true } }).allowed).toBe(false);
    }
  });

  it("a call opt-out blocks every purpose", () => {
    for (const purpose of CONSENT_PURPOSES) {
      expect(decideConsent("call", purpose, { preferences: { opted_out_calls: true } }).allowed).toBe(false);
    }
  });

  it("an email opt-out lets transactional mail through and nothing else", () => {
    const inputs = { preferences: { opted_out_email: true } };
    expect(decideConsent("email", "transactional", inputs).allowed).toBe(true);
    expect(decideConsent("email", "conversation", inputs).allowed).toBe(false);
    expect(decideConsent("email", "automated", inputs).allowed).toBe(false);
    expect(decideConsent("email", "marketing", inputs).allowed).toBe(false);
  });

  it("one channel's opt-out never blocks another", () => {
    expect(decideConsent("email", "conversation", { preferences: { opted_out_sms: true } }).allowed).toBe(true);
    expect(decideConsent("sms", "conversation", { preferences: { opted_out_email: true } }).allowed).toBe(true);
    expect(decideConsent("sms", "conversation", { preferences: { opted_out_calls: true } }).allowed).toBe(true);
    expect(decideConsent("call", "automated", { smsUnsubscribe: { unsubscribed_at: SEP_3 } }).allowed).toBe(true);
  });
});

describe("what a denial says", () => {
  it("a STOP reply is dated and says so", () => {
    const d = decideConsent("sms", "automated", {
      smsUnsubscribe: { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.stopReply },
    });
    expect(d).toMatchObject({ allowed: false, source: "sms_unsubscribe", via: "stop_reply", since: SEP_3 });
  });

  it("a carrier refusal is told apart from a STOP we saw", () => {
    const d = decideConsent("sms", "conversation", {
      smsUnsubscribe: { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.carrier },
    });
    expect(d).toMatchObject({ allowed: false, via: "carrier" });
  });

  it("an unsubscribe for any other reason is still dated", () => {
    const d = decideConsent("email", "marketing", { emailUnsubscribe: { unsubscribed_at: SEP_3, reason: "bounce" } });
    expect(d).toMatchObject({ allowed: false, source: "email_unsubscribe", via: "unsubscribed", since: SEP_3 });
  });

  it("a switch set by the team has no date to give", () => {
    const d = decideConsent("call", "automated", { preferences: { opted_out_calls: true } });
    expect(d).toMatchObject({ allowed: false, source: "client_preference", via: "marked", since: null });
  });

  it("prefers the dated record when both say no", () => {
    const d = decideConsent("sms", "conversation", {
      preferences: { opted_out_sms: true },
      smsUnsubscribe: { unsubscribed_at: SEP_3, reason: OPT_OUT_REASON.stopReply },
    });
    expect(d).toMatchObject({ source: "sms_unsubscribe", since: SEP_3 });
  });
});

describe("opt-out and opt-in keywords", () => {
  it("recognises STOP and its synonyms (the existing rule)", () => {
    for (const w of ["STOP", "stop", " Unsubscribe ", "END", "quit", "Cancel"]) {
      expect(shouldStopMessaging(w)).toBe(true);
    }
    expect(shouldStopMessaging("please stop by at 3")).toBe(false);
  });

  it("recognises START and UNSTOP, exactly", () => {
    for (const w of ["START", "start", " Unstop "]) expect(shouldStartMessaging(w)).toBe(true);
  });

  it("does not read YES as consent — customers text YES to confirm appointments", () => {
    expect(shouldStartMessaging("YES")).toBe(false);
    expect(shouldStartMessaging("start me an appointment")).toBe(false);
  });
});
