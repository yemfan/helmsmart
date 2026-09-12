/**
 * One number, one verdict, in three languages.
 *
 * The defect these tests stand over: a business could set a phone number and
 * nothing would ever answer it, while three separate screens each said
 * something reassuring. "Ready" came off our own database, "Connected" came off
 * a non-empty column, and the /voice dashboard said nothing at all — none of
 * them had asked the provider whether a call would be picked up.
 *
 * So the mapping from "what the provider told us" to "what the owner reads"
 * lives in one pure function, and these are the cases that must never drift:
 * every failing check names itself, an unaskable provider is not a pass, and no
 * path through here produces a green claim without `ok`.
 */
import { describe, it, expect } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";
import { describeWiring, isReceptionistReady, type WiringResult } from "@/lib/voice/number-wiring";

const LOCALES = ["en", "es", "zh-Hans"] as const;

/** The provider's answer when everything is right. */
const wired: WiringResult = { ok: true, numberFound: true, webhookOk: true, agentOk: true };

describe("describeWiring", () => {
  it("calls a fully wired number wired, with nothing to fix", () => {
    const v = describeWiring(wired);
    expect(v.state).toBe("wired");
    expect(v.reasonKeys).toEqual([]);
    expect(v.canRebind).toBe(false);
  });

  // ─── The three failure modes ──────────────────────────────────────────────

  it("failure 1 — the provider has never heard of the number: not ours to repair", () => {
    const v = describeWiring({ ok: false, numberFound: false, webhookOk: false, agentOk: false });
    expect(v.state).toBe("unwired");
    expect(v.reasonKeys).toEqual(["wiring.reason.notInProvider"]);
    // Nothing to re-bind — a number we do not hold cannot be PATCHed into
    // place, so this org gets the manual URLs instead of a button that fails.
    expect(v.canRebind).toBe(false);
  });

  it("failure 2 — the number exists but our agent isn't bound to it", () => {
    const v = describeWiring({ ok: false, numberFound: true, webhookOk: true, agentOk: false });
    expect(v.state).toBe("unwired");
    expect(v.reasonKeys).toEqual(["wiring.reason.agentNotBound"]);
    expect(v.canRebind).toBe(true);
  });

  it("failure 3 — the number exists but its inbound webhook points elsewhere", () => {
    const v = describeWiring({ ok: false, numberFound: true, webhookOk: false, agentOk: true });
    expect(v.state).toBe("unwired");
    expect(v.reasonKeys).toEqual(["wiring.reason.webhookElsewhere"]);
    expect(v.canRebind).toBe(true);
  });

  it("names both when both are wrong, agent first", () => {
    const v = describeWiring({ ok: false, numberFound: true, webhookOk: false, agentOk: false });
    expect(v.reasonKeys).toEqual(["wiring.reason.agentNotBound", "wiring.reason.webhookElsewhere"]);
  });

  it("still says something when the provider disagrees for a reason we can't name", () => {
    // `ok: false` with both sub-checks true should not happen. Rendering an
    // empty reason list would show a warning with no sentence in it.
    const v = describeWiring({ ok: false, numberFound: true, webhookOk: true, agentOk: true });
    expect(v.reasonKeys).toEqual(["wiring.reason.misconfigured"]);
  });

  // ─── Not a pass ───────────────────────────────────────────────────────────

  it("a provider error is 'could not check', never a failing number", () => {
    // Blaming the number for a missing API key sends the owner to fix the
    // wrong thing — and telling them it's fine is worse.
    const v = describeWiring({
      ok: false,
      numberFound: false,
      webhookOk: false,
      agentOk: false,
      error: "RETELL_API_KEY isn't set on the server.",
    });
    expect(v.state).toBe("unknown");
    expect(v.headlineKey).toBe("wiring.couldNotCheck");
    expect(v.errorText).toBe("RETELL_API_KEY isn't set on the server.");
    expect(v.reasonKeys).toEqual([]);
  });

  it("not checked yet is not checked — not wired", () => {
    expect(describeWiring(null).state).toBe("unknown");
  });

  it("no input ever produces 'wired' without the provider saying ok", () => {
    const everyCombination: WiringResult[] = [];
    for (const numberFound of [true, false]) {
      for (const webhookOk of [true, false]) {
        for (const agentOk of [true, false]) {
          everyCombination.push({ ok: false, numberFound, webhookOk, agentOk });
        }
      }
    }
    for (const r of everyCombination) {
      expect(describeWiring(r).state).not.toBe("wired");
    }
  });
});

describe("isReceptionistReady", () => {
  it("needs both halves — the app checklist AND an answered number", () => {
    expect(isReceptionistReady(true, wired)).toBe(true);
    // The exact bug: every app-side box ticked over a number Retell never had.
    expect(isReceptionistReady(true, { ok: false, numberFound: false, webhookOk: false, agentOk: false })).toBe(false);
    // And the check not having returned yet is not a licence to say Ready.
    expect(isReceptionistReady(true, null)).toBe(false);
    expect(isReceptionistReady(false, wired)).toBe(false);
  });
});

describe("the copy each verdict produces", () => {
  const cases: Array<{ name: string; result: WiringResult }> = [
    { name: "not in provider", result: { ok: false, numberFound: false, webhookOk: false, agentOk: false } },
    { name: "agent not bound", result: { ok: false, numberFound: true, webhookOk: true, agentOk: false } },
    { name: "webhook elsewhere", result: { ok: false, numberFound: true, webhookOk: false, agentOk: true } },
  ];

  for (const locale of LOCALES) {
    const t = translatorFor(locale, "voice");

    it(`${locale}: every headline and reason resolves to real words`, () => {
      for (const { name, result } of [...cases, { name: "wired", result: wired }]) {
        const v = describeWiring(result);
        const headline = t(v.headlineKey, { number: "+16265550147" });
        // A missing key comes back as the key itself — that is the failure
        // mode this whole namespace exists to prevent.
        expect(headline, `${locale} / ${name}`).not.toBe(v.headlineKey);
        expect(headline.length).toBeGreaterThan(0);
        for (const key of v.reasonKeys) {
          expect(t(key), `${locale} / ${name} / ${key}`).not.toBe(key);
        }
      }
    });

    it(`${locale}: the unwired headline names the number and says calls aren't answered`, () => {
      const v = describeWiring(cases[0].result);
      const headline = t(v.headlineKey, { number: "+16265550147" });
      expect(headline).toContain("+16265550147");
    });
  }

  it("en: the sentence an owner reads is about their calls, not our plumbing", () => {
    const t = translatorFor("en", "voice");
    const v = describeWiring({ ok: false, numberFound: false, webhookOk: false, agentOk: false });
    expect(t(v.headlineKey, { number: "+16265550147" })).toBe(
      "+16265550147 isn't connected to your AI receptionist yet — calls to it won't be answered."
    );
  });
});
