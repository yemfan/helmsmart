import { describe, expect, it } from "vitest";
import { renderGrowthDigestEmail, selectTopOpportunities } from "../renderDigestEmail";
import type { GrowthOpportunity } from "../opportunityTypes";

function opp(overrides: Partial<GrowthOpportunity> = {}): GrowthOpportunity {
  return {
    id: "opp-1",
    priority: "medium",
    category: "stale_sphere",
    title: "Do something",
    insight: "Because reasons.",
    action: "Click this.",
    actionUrl: "/dashboard/contacts",
    actionLabel: "Open contacts",
    context: [],
    ...overrides,
  };
}

describe("selectTopOpportunities", () => {
  it("sorts high > medium > low and takes the top N", () => {
    const input = [
      opp({ id: "a", priority: "low" }),
      opp({ id: "b", priority: "high" }),
      opp({ id: "c", priority: "medium" }),
      opp({ id: "d", priority: "high" }),
    ];
    const out = selectTopOpportunities(input, 3);
    expect(out.map((o) => o.id)).toEqual(["b", "d", "c"]);
  });

  it("preserves order within the same priority (stable-ish)", () => {
    const input = [
      opp({ id: "a", priority: "high" }),
      opp({ id: "b", priority: "high" }),
      opp({ id: "c", priority: "high" }),
    ];
    const out = selectTopOpportunities(input, 3);
    expect(out.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("returns empty array when input is empty", () => {
    expect(selectTopOpportunities([], 3)).toEqual([]);
  });
});

describe("renderGrowthDigestEmail", () => {
  it("includes the agent first name in the greeting", () => {
    const out = renderGrowthDigestEmail({
      opportunities: [opp()],
      appBaseUrl: "https://www.realtybossai.com",
      agentFirstName: "Michael",
    });
    expect(out.html).toContain("Hi Michael,");
    expect(out.text).toContain("Top 1 growth");
  });

  it("bumps subject with (1 urgent) when top priority is high", () => {
    const out = renderGrowthDigestEmail({
      opportunities: [opp({ priority: "high" }), opp({ priority: "low" })],
      appBaseUrl: "https://x.test",
    });
    expect(out.subject).toMatch(/1 urgent/);
  });

  it("uses a plain subject when nothing is urgent", () => {
    const out = renderGrowthDigestEmail({
      opportunities: [opp({ priority: "medium" }), opp({ priority: "low" })],
      appBaseUrl: "https://x.test",
    });
    expect(out.subject).not.toMatch(/urgent/i);
  });

  it("uses singular 'opportunity' when there is exactly one", () => {
    const out = renderGrowthDigestEmail({
      opportunities: [opp()],
      appBaseUrl: "https://x.test",
    });
    expect(out.subject).toMatch(/1 growth opportunity/);
  });

  it("escapes HTML in titles, insights, and context chips", () => {
    const out = renderGrowthDigestEmail({
      opportunities: [
        opp({
          title: "<script>alert(1)</script>",
          insight: "Tom & Jane's offer",
          context: ["A & B", "<b>bad</b>"],
        }),
      ],
      appBaseUrl: "https://x.test",
    });
    expect(out.html).not.toContain("<script>alert(1)</script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("Tom &amp; Jane");
    expect(out.html).toContain("A &amp; B");
  });

  it("absolutizes relative action URLs against appBaseUrl", () => {
    const out = renderGrowthDigestEmail({
      opportunities: [opp({ actionUrl: "/dashboard/offers/abc" })],
      appBaseUrl: "https://www.realtybossai.com",
    });
    expect(out.html).toContain("https://www.realtybossai.com/dashboard/offers/abc");
    expect(out.text).toContain("https://www.realtybossai.com/dashboard/offers/abc");
  });

  it("leaves absolute URLs alone", () => {
    const out = renderGrowthDigestEmail({
      opportunities: [opp({ actionUrl: "https://elsewhere.com/x" })],
      appBaseUrl: "https://x.test",
    });
    expect(out.html).toContain("https://elsewhere.com/x");
    expect(out.html).not.toContain("https://x.testhttps://");
  });

  it("omits the action button when actionUrl is null", () => {
    const out = renderGrowthDigestEmail({
      opportunities: [opp({ actionUrl: null, actionLabel: null })],
      appBaseUrl: "https://x.test",
    });
    // Card stays, but no dashboard-styled anchor button for THIS card.
    // The footer "See all opportunities" anchor still exists.
    const anchorCount = (out.html.match(/<a href="/g) ?? []).length;
    expect(anchorCount).toBe(1); // footer link only
  });

  it("caps context chips at 3 even if more are provided", () => {
    const out = renderGrowthDigestEmail({
      opportunities: [opp({ context: ["one", "two", "three", "four", "five"] })],
      appBaseUrl: "https://x.test",
    });
    expect(out.html).toContain(">one<");
    expect(out.html).toContain(">three<");
    expect(out.html).not.toContain(">four<");
  });

  it("footer always points to /dashboard/growth", () => {
    const out = renderGrowthDigestEmail({
      opportunities: [opp()],
      appBaseUrl: "https://www.realtybossai.com",
    });
    expect(out.html).toContain("https://www.realtybossai.com/dashboard/growth");
  });
});
