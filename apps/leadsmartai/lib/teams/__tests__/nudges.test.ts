import { describe, expect, it } from "vitest";
import type { MarketingRow } from "../marketing";
import { NUDGE_MAX_PER_CLICK, nudgeMessage, planNudges } from "../nudges";

const row = (over: Partial<MarketingRow>): MarketingRow => ({
  agentId: "1",
  role: "member",
  name: "Ann Lee",
  email: "ann@example.com",
  hubPublished: false,
  username: null,
  networks: [],
  gaConfigured: false,
  pixelConfigured: false,
  autopilotMode: null,
  postsPublished: 0,
  postsFailed: 0,
  scheduledUpcoming: 0,
  lastPostAt: null,
  hubViews: 0,
  hubLeads: 0,
  attention: ["no_hub", "no_network"],
  ...over,
});

describe("planNudges", () => {
  it("takes the bucket, skips the recently nudged and the address-less, and caps the click", () => {
    const rows = [
      row({ agentId: "1" }),
      row({ agentId: "2", email: null }),
      row({ agentId: "3" }),
      row({ agentId: "4", attention: ["silent"] }),
    ];
    const plan = planNudges(rows, "no_hub", new Set(["3"]));
    expect(plan.to.map((r) => r.agentId)).toEqual(["1"]);
    expect(plan.skippedRecent).toBe(1);
    expect(plan.noEmail).toBe(1);

    const many = Array.from({ length: NUDGE_MAX_PER_CLICK + 5 }, (_, i) => row({ agentId: String(i) }));
    expect(planNudges(many, "no_network", new Set()).to).toHaveLength(NUDGE_MAX_PER_CLICK);
  });
});

describe("nudgeMessage", () => {
  it("greets by first name, names the brokerage, links the fix, and escapes html", () => {
    const m = nudgeMessage("no_hub", { first: "Ann", from: "Bob <Broker>", brokerage: "MAXY & Co", origin: "https://www.closebossai.com" });
    expect(m.subject).toBe("Your lead page is one click from live");
    expect(m.text).toContain("Hi Ann,");
    expect(m.text).toContain("MAXY & Co");
    expect(m.text).toContain("https://www.closebossai.com/dashboard/hub/editor");
    expect(m.text.trimEnd().endsWith("Bob <Broker>\nMAXY & Co")).toBe(true);
    expect(m.html).toContain("Bob &lt;Broker&gt;");
    expect(m.html).toContain("MAXY &amp; Co");
  });

  it("falls back to a plain greeting and signs as the brokerage alone", () => {
    const m = nudgeMessage("failing", { first: null, from: null, brokerage: "Team", origin: "https://x.test" });
    expect(m.text.startsWith("Hi,\n")).toBe(true);
    expect(m.text).toContain("https://x.test/dashboard/leads/generate/scheduled");
    expect(m.text.trimEnd().endsWith("\nTeam")).toBe(true);
  });
});
