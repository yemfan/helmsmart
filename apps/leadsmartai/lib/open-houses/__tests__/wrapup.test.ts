import { describe, expect, it } from "vitest";
import type { OpenHouseVisitorRow } from "../types";
import { buildWrapupSummary, renderWrapupEmail, wrapupDue, wrapupRecipients } from "../wrapup";

const visitor = (over: Partial<OpenHouseVisitorRow>): OpenHouseVisitorRow =>
  ({
    id: "v",
    open_house_id: "oh",
    agent_id: "26",
    contact_id: null,
    name: "Alex Sample",
    email: "alex@example.com",
    phone: "+16265551234",
    is_buyer_agented: false,
    buyer_agent_name: null,
    buyer_agent_brokerage: null,
    timeline: "now",
    buyer_status: "looking",
    marketing_consent: true,
    thank_you_sent_at: null,
    check_in_sent_at: null,
    notes: null,
    created_at: "2026-09-14T21:10:00Z",
    ...over,
  }) as OpenHouseVisitorRow;

const oh = { property_address: "1187 Santa Anita Ave", city: "Arcadia", state: "CA", start_at: "2026-09-14T21:00:00Z", end_at: "2026-09-14T23:00:00Z", list_price: 1_725_000 };

describe("buildWrapupSummary", () => {
  it("counts the sheet and keeps sign-in order", () => {
    const s = buildWrapupSummary(
      [
        visitor({ id: "2", name: "Bo Later", timeline: "later", buyer_status: "just_browsing", marketing_consent: false, created_at: "2026-09-14T22:00:00Z" }),
        visitor({ id: "1" }),
        visitor({ id: "3", name: "Cy Agented", is_buyer_agented: true, buyer_agent_name: "Dee Broker", buyer_agent_brokerage: "Example Realty", timeline: "3_6_months", notes: "Loved the yard", created_at: "2026-09-14T22:30:00Z" }),
      ],
      new Date("2026-09-15T03:00:00Z"),
    );
    expect(s.total).toBe(3);
    expect(s.represented).toBe(1);
    expect(s.unrepresented).toBe(2);
    expect(s.optedIn).toBe(2);
    expect(s.hot).toBe(2);
    expect(s.byTimeline.now).toBe(1);
    expect(s.byStatus.just_browsing).toBe(1);
    expect(s.visitors.map((v) => v.name)).toEqual(["Alex Sample", "Bo Later", "Cy Agented"]);
  });

  it("names a visitor by what they left", () => {
    const s = buildWrapupSummary([visitor({ name: null, email: null, phone: "+16265559999" })]);
    expect(s.visitors[0].name).toBe("+16265559999");
  });
});

describe("wrapupDue and recipients", () => {
  it("is due once the end time passes, unless cancelled or already summarised", () => {
    const now = Date.parse("2026-09-15T00:00:00Z");
    expect(wrapupDue({ end_at: "2026-09-14T23:00:00Z", status: "scheduled" }, now)).toBe(true);
    expect(wrapupDue({ end_at: "2026-09-15T01:00:00Z", status: "scheduled" }, now)).toBe(false);
    expect(wrapupDue({ end_at: "2026-09-14T23:00:00Z", status: "cancelled" }, now)).toBe(false);
    expect(wrapupDue({ end_at: "2026-09-14T23:00:00Z", status: "completed", summary_ready_at: "2026-09-14T23:30:00Z" }, now)).toBe(false);
  });

  it("only sends where there is an address", () => {
    const r = wrapupRecipients({ owner_name: "Pat Owner", owner_email: " pat@example.com ", requesting_agent_name: "Lee Agent", requesting_agent_email: "" }, ["owner", "agent"]);
    expect(r).toEqual([{ audience: "owner", name: "Pat Owner", email: "pat@example.com" }]);
    expect(wrapupRecipients({ owner_email: "pat@example.com" }, ["agent"])).toEqual([]);
  });
});

describe("renderWrapupEmail", () => {
  const summary = buildWrapupSummary([visitor({}), visitor({ id: "3", name: "Cy Agented", is_buyer_agented: true, buyer_agent_name: "Dee Broker", buyer_agent_brokerage: null, timeline: "3_6_months", notes: 'Said "great light"' })]);
  const host = { name: "Michael Ye", email: "michael@example.com", phone: "+16265550000", brokerage: "MAXY Realty Group" };

  it("keeps contact details away from the owner and gives the agent the sheet", () => {
    const owner = renderWrapupEmail({ openHouse: oh, summary, hostComment: "Strong turnout; two serious buyers.", host, audience: "owner", recipientName: "Pat Owner", timeZone: "America/Los_Angeles" });
    expect(owner.subject).toBe("Open house wrap-up: 1187 Santa Anita Ave, Arcadia · Monday, September 14");
    expect(owner.text).toContain("Hi Pat,");
    expect(owner.text).toContain("2 visitors signed in");
    expect(owner.text).toContain("1 without an agent · 1 with their own agent");
    expect(owner.text).toContain("Strong turnout");
    expect(owner.text).toContain("Alex Sample — Buying now");
    expect(owner.text).not.toContain("alex@example.com");
    expect(owner.text).not.toContain("+16265551234");
    expect(owner.html).toContain("Said &quot;great light&quot;");

    const agent = renderWrapupEmail({ openHouse: oh, summary, hostComment: null, host, audience: "agent", recipientName: null, timeZone: "America/Los_Angeles" });
    expect(agent.text).toContain("Hi,");
    expect(agent.text).toContain("Sign-in sheet:");
    expect(agent.text).toContain("alex@example.com · +16265551234");
    expect(agent.text).toContain("with Dee Broker");
    expect(agent.text.trimEnd().endsWith("Michael Ye · MAXY Realty Group · +16265550000 · michael@example.com")).toBe(true);
  });

  it("says plainly when nobody came", () => {
    const m = renderWrapupEmail({ openHouse: oh, summary: buildWrapupSummary([]), hostComment: null, host, audience: "owner", recipientName: null, timeZone: "America/Los_Angeles" });
    expect(m.text).toContain("No one signed in at today's open house");
  });
});
