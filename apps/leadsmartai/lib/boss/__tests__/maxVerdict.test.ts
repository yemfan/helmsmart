import { describe, it, expect } from "vitest";
import { parseMaxVerdict } from "../maxVerdict";

const wrap = (o: unknown) => JSON.stringify(o);

/**
 * Max's judgement can't be unit-tested. What we do with a mangled answer can —
 * and that's the half that decides whether unreviewed text reaches a client.
 *
 * The invariant under test: nothing malformed may ever become "approve".
 */
describe("parseMaxVerdict", () => {
  it("passes a clean approval through", () => {
    const r = parseMaxVerdict(wrap({ verdict: "approve", reason: "Reads well." }), "sms");
    expect(r.verdict).toBe("approve");
  });

  it("carries the corrected text on a fix", () => {
    const r = parseMaxVerdict(
      wrap({ verdict: "fix", body: "Hi Michael, just checking in.", reason: "Missing name." }),
      "sms",
    );
    expect(r.verdict).toBe("fix");
    expect(r.body).toBe("Hi Michael, just checking in.");
  });

  it("escalates a fix that has nothing to fix it to", () => {
    // The dangerous case: "fix" with no body could look like approval of the
    // original, which is the one thing it must never be.
    const r = parseMaxVerdict(wrap({ verdict: "fix", body: "", reason: "Typo." }), "sms");
    expect(r.verdict).toBe("escalate");
  });

  it("escalates a verdict it does not recognise", () => {
    const r = parseMaxVerdict(wrap({ verdict: "looks_fine_to_me", reason: "" }), "sms");
    expect(r.verdict).toBe("escalate");
  });

  it("escalates on unparseable output", () => {
    expect(parseMaxVerdict("I think this one is fine, send it.", "sms").verdict).toBe("escalate");
    expect(parseMaxVerdict("{ not json", "sms").verdict).toBe("escalate");
    expect(parseMaxVerdict("", "sms").verdict).toBe("escalate");
  });

  it("keeps a rejection, so the agent can see why", () => {
    const r = parseMaxVerdict(
      wrap({ verdict: "reject", reason: "Quotes a price we can't stand behind." }),
      "sms",
    );
    expect(r.verdict).toBe("reject");
    expect(r.reason).toMatch(/price/i);
  });

  it("reads a verdict wrapped in prose or code fences", () => {
    const r = parseMaxVerdict(
      '```json\n{"verdict":"approve","reason":"Fine."}\n```',
      "sms",
    );
    expect(r.verdict).toBe("approve");
  });

  it("truncates a fix to the channel limit", () => {
    const long = "x".repeat(500);
    const r = parseMaxVerdict(wrap({ verdict: "fix", body: long, reason: "" }), "sms");
    expect(r.body?.length).toBe(320);
  });

  it("never approves on a malformed reply, whatever the shape", () => {
    const junk = ["null", "[]", '{"verdict":null}', '{"body":"hi"}', "undefined", "{}"];
    for (const j of junk) {
      expect(parseMaxVerdict(j, "sms").verdict).not.toBe("approve");
    }
  });
});
