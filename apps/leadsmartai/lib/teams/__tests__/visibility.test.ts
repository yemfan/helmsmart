import { describe, expect, it } from "vitest";
import { hideTeamNav, TEAM_NAV_HREF } from "../navVisibility";
import { planRunsTeams, showTeamNav } from "../visibility";

describe("planRunsTeams", () => {
  it("is Signature and the contract Team plan, and nothing below", () => {
    expect(planRunsTeams("signature")).toBe(true);
    expect(planRunsTeams("team")).toBe(true);
    expect(planRunsTeams("premium")).toBe(false);
    expect(planRunsTeams("pro")).toBe(false);
    expect(planRunsTeams("starter")).toBe(false);
    expect(planRunsTeams(null)).toBe(false);
    expect(planRunsTeams("elite")).toBe(false);
  });
});

describe("showTeamNav", () => {
  it("shows the row to a plan that runs teams, or to anyone already on a team", () => {
    expect(showTeamNav({ plan: "signature", isMember: false })).toBe(true);
    expect(showTeamNav({ plan: "premium", isMember: false })).toBe(false);
    expect(showTeamNav({ plan: "starter", isMember: true })).toBe(true);
    expect(showTeamNav({ plan: null, isMember: false })).toBe(false);
  });
});

describe("hideTeamNav", () => {
  const sections = [
    { label: "Ask Max", href: "/dashboard/boss" },
    { label: "Team", href: TEAM_NAV_HREF },
    { label: "More", items: [{ label: "Billing", href: "/dashboard/billing" }, { label: "Team", href: TEAM_NAV_HREF }] },
    { kind: "divider" },
  ];

  it("leaves the menu alone when the row should show", () => {
    expect(hideTeamNav(sections, true)).toEqual(sections);
  });

  it("removes the row at the top level and inside a group, and nothing else", () => {
    const out = hideTeamNav(sections, false);
    expect(out.map((s) => (s as { label?: string }).label)).toEqual(["Ask Max", "More", undefined]);
    expect((out[1] as { items: { label: string }[] }).items.map((i) => i.label)).toEqual(["Billing"]);
    // The input is not mutated: the same config renders for the next person.
    expect(sections[2].items).toHaveLength(2);
  });
});
