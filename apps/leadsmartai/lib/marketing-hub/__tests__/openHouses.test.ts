import { describe, expect, it } from "vitest";
import { formatListPrice, formatOpenHouseWhen, openHouseLocality, upcomingOpenHouses } from "../openHouses";

const NOW = "2026-09-10T18:00:00Z";

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "oh-1",
    property_address: "713 S 8th St, Alhambra, CA 91801",
    city: "Alhambra",
    state: "CA",
    list_price: 1180000,
    start_at: "2026-09-12T20:00:00Z",
    end_at: "2026-09-12T22:00:00Z",
    signin_slug: "pu8UahYUwbM8",
    status: "scheduled",
    ...over,
  };
}

describe("upcomingOpenHouses", () => {
  it("keeps scheduled and in-progress open houses that have not ended, soonest first", () => {
    const out = upcomingOpenHouses(
      [
        row({ id: "later", start_at: "2026-09-20T20:00:00Z", end_at: "2026-09-20T22:00:00Z" }),
        row({ id: "now", status: "in_progress", start_at: "2026-09-10T17:00:00Z", end_at: "2026-09-10T19:00:00Z" }),
        row({ id: "soon" }),
      ],
      NOW,
    );
    expect(out.map((o) => o.id)).toEqual(["now", "soon", "later"]);
  });

  it("drops what a visitor cannot attend: ended, completed, cancelled, or without a page", () => {
    const out = upcomingOpenHouses(
      [
        row({ id: "ended", start_at: "2026-05-09T21:00:00Z", end_at: "2026-05-09T23:00:00Z" }),
        row({ id: "done", status: "completed" }),
        row({ id: "off", status: "cancelled" }),
        row({ id: "noslug", signin_slug: "" }),
        row({ id: "ok" }),
      ],
      NOW,
    );
    expect(out.map((o) => o.id)).toEqual(["ok"]);
  });

  it("treats a zero or missing price as no price", () => {
    const [a, b] = upcomingOpenHouses([row({ id: "a", list_price: 0 }), row({ id: "b", list_price: null })], NOW);
    expect(a.listPrice).toBeNull();
    expect(b.listPrice).toBeNull();
  });

  it("caps the list", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ id: String(i) }));
    expect(upcomingOpenHouses(rows, NOW, 2)).toHaveLength(2);
  });
});

describe("formatOpenHouseWhen", () => {
  it("renders in the agent's time zone and the visitor's locale", () => {
    const en = formatOpenHouseWhen("2026-09-12T20:00:00Z", "2026-09-12T22:00:00Z", "en-US", "America/Los_Angeles");
    expect(en.date).toBe("Sat, Sep 12");
    expect(en.time).toMatch(/1:00\s*[–-]\s*3:00\s*PM/);

    const zh = formatOpenHouseWhen("2026-09-12T20:00:00Z", "2026-09-12T22:00:00Z", "zh-CN", "America/Los_Angeles");
    expect(zh.date).toContain("9月12日");
  });

  it("falls back to Los Angeles when the agent has no time zone", () => {
    const { time } = formatOpenHouseWhen("2026-09-12T20:00:00Z", "2026-09-12T22:00:00Z", "en-US", null);
    expect(time).toMatch(/1:00/);
  });
});

describe("formatListPrice / openHouseLocality", () => {
  it("formats a price and hides a missing one", () => {
    expect(formatListPrice(1180000, "en-US")).toBe("$1,180,000");
    expect(formatListPrice(null, "en-US")).toBeNull();
  });

  it("joins city and state, and is null when neither is known", () => {
    expect(openHouseLocality({ city: "Alhambra", state: "CA" })).toBe("Alhambra, CA");
    expect(openHouseLocality({ city: null, state: "CA" })).toBe("CA");
    expect(openHouseLocality({ city: null, state: null })).toBeNull();
  });
});
