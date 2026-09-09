import { describe, expect, it } from "vitest";
import { attentionFor, autopilotIsOn, buildTeamMarketing, type MarketingInput } from "../marketing";

const base: MarketingInput = {
  agentId: "a",
  role: "member",
  name: "Ann",
  email: null,
  hubPublished: true,
  username: "ann",
  networks: ["meta"],
  gaConfigured: true,
  pixelConfigured: false,
  autopilotMode: "auto",
  postsPublished: 3,
  postsFailed: 0,
  scheduledUpcoming: 2,
  lastPostAt: "2026-09-08T00:00:00Z",
  hubViews: 40,
  hubLeads: 2,
};

describe("attentionFor", () => {
  it("is empty for an agent who is set up and posting", () => {
    expect(attentionFor(base)).toEqual([]);
  });

  it("names every missing piece, in coaching order", () => {
    expect(attentionFor({ ...base, hubPublished: false, networks: [], postsPublished: 0, scheduledUpcoming: 0 })).toEqual(["no_hub", "no_network"]);
    expect(attentionFor({ ...base, gaConfigured: false, postsFailed: 1 })).toEqual(["no_tracking", "failing"]);
  });

  it("does not ask for tracking on a hub that is not live", () => {
    expect(attentionFor({ ...base, hubPublished: false, gaConfigured: false })).toEqual(["no_hub"]);
  });

  it("calls an agent silent only when the networks are there and nothing moves", () => {
    expect(attentionFor({ ...base, postsPublished: 0, scheduledUpcoming: 0 })).toEqual(["silent"]);
    expect(attentionFor({ ...base, postsPublished: 0, scheduledUpcoming: 1 })).toEqual([]);
    expect(attentionFor({ ...base, networks: [], postsPublished: 0, scheduledUpcoming: 0 })).toEqual(["no_network"]);
  });
});

describe("buildTeamMarketing", () => {
  it("orders the most active first, then by name, and counts the team", () => {
    const t = buildTeamMarketing(30, [
      { ...base, agentId: "c", name: "Cy", postsPublished: 0, scheduledUpcoming: 0, hubViews: 5, networks: ["meta", "tiktok"] },
      { ...base, agentId: "b", name: "bob", postsPublished: 3, hubViews: 90, autopilotMode: "ask", pixelConfigured: true },
      { ...base, agentId: "d", name: "Dee", hubPublished: false, networks: [], postsPublished: 0, scheduledUpcoming: 0, hubViews: 0, gaConfigured: false },
      base,
    ]);
    expect(t.rows.map((r) => r.agentId)).toEqual(["b", "a", "c", "d"]);
    expect(t.summary).toEqual({
      agents: 4,
      hubPublished: 3,
      withNetwork: 3,
      withTracking: 3,
      autopilotOn: 3,
      posting: 2,
      postsPublished: 6,
      postsFailed: 0,
      scheduledUpcoming: 4,
      hubViews: 135,
      hubLeads: 8,
      byNetwork: { meta: 3, tiktok: 1 },
    });
    expect(t.attention).toEqual([
      { key: "no_hub", count: 1 },
      { key: "no_network", count: 1 },
      { key: "silent", count: 1 },
    ]);
  });

  it("is empty for a team with no members", () => {
    const t = buildTeamMarketing(7, []);
    expect(t.rows).toEqual([]);
    expect(t.summary.agents).toBe(0);
    expect(t.attention).toEqual([]);
  });
});

describe("autopilotIsOn", () => {
  it("counts auto and review as on, ask and assisted as off", () => {
    expect(autopilotIsOn("auto")).toBe(true);
    expect(autopilotIsOn("review")).toBe(true);
    expect(autopilotIsOn("ask")).toBe(false);
    expect(autopilotIsOn("assisted")).toBe(false);
    expect(autopilotIsOn(null)).toBe(false);
  });
});
