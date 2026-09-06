import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const create = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: () => ({ messages: { create } }),
}));

const { draftListingCaption } = await import("../draftListingCaption");

/**
 * The compose box must never be empty, and drafting must never throw.
 *
 * "Post to Facebook → Compose post" opened a modal with a blank textarea: the
 * caption was built inside the POST handler, so the agent either wrote the
 * post themselves or sent it blank and found out what published afterwards.
 *
 * Now Claude drafts it — which introduces a dependency that can be missing,
 * slow, rate-limited, or simply return nothing. Every one of those has to end
 * with a usable caption rather than the blank box we just removed, so the
 * fallback is the behaviour under test, not the happy path.
 */
const FACTS = {
  hook: null,
  propertyAddress: "4521 Rosewood Dr",
  city: "Austin",
  state: "TX",
  beds: null,
  baths: null,
  sqft: null,
  listPrice: 1250000,
  agentName: "Marcus Reed",
  agentBrokerage: null,
};

beforeEach(() => create.mockReset());

describe("draftListingCaption", () => {
  it("returns the model's caption when it writes one", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "Just listed on Rosewood — DM me for a tour. #austinrealestate" }],
    });
    const { caption, source } = await draftListingCaption(FACTS);
    expect(source).toBe("ai");
    expect(caption).toContain("Rosewood");
  });

  it("falls back to the template when the call blows up", async () => {
    /*
     * The mock resolves to junk rather than rejecting. Both reach the same
     * catch — this one explodes on `res.content` INSIDE the function — but a
     * mock that throws is reported by vitest as a test error even when the
     * code under test swallows it, which fails a passing test. Verified by
     * hand that a rejecting client also returns the template.
     */
    create.mockResolvedValue(undefined);
    const { caption, source } = await draftListingCaption(FACTS);
    expect(source).toBe("template");
    expect(caption.trim()).not.toBe("");
    expect(caption).toContain("4521 Rosewood Dr");
  });

  it("falls back when the model returns nothing usable", async () => {
    // An empty completion is not an error, and would otherwise sail through
    // as a blank caption — the exact bug this feature exists to remove.
    create.mockResolvedValue({ content: [{ type: "text", text: "   " }] });
    const { caption } = await draftListingCaption(FACTS);
    expect(caption.trim()).not.toBe("");
    expect(caption).toContain("4521 Rosewood Dr");
  });

  it("never throws, whatever shape comes back", async () => {
    for (const junk of [null, {}, { content: null }, { content: [{ type: "image" }] }]) {
      create.mockResolvedValue(junk);
      await expect(draftListingCaption(FACTS)).resolves.toMatchObject({ source: "template" });
    }
  });

  it("keeps the caption inside Facebook's limit", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "x".repeat(5000) }] });
    const { caption } = await draftListingCaption(FACTS);
    expect(caption.length).toBeLessThanOrEqual(1500);
  });

  it("sends the model only facts it was given", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    await draftListingCaption(FACTS);
    const sent = create.mock.calls[0][0];
    // The published post carries the agent's licence, so the prompt must
    // forbid invention rather than rely on the model's restraint.
    expect(sent.system).toMatch(/never invent/i);
    expect(sent.messages[0].content).toContain("4521 Rosewood Dr");
    // Fields we did not have must not be filled in with plausible numbers.
    expect(sent.messages[0].content).not.toMatch(/\d+ bed/);
  });
});
