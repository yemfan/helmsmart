import { describe, expect, it } from "vitest";
import { goalKey, orderForGoal, suggestionKeys } from "../goal";

describe("realtor goal", () => {
  it("reduces the interview labels to keys, emoji and all", () => {
    expect(goalKey("🎯 More leads")).toBe("leads");
    expect(goalKey("⚡ Faster follow-up")).toBe("followup");
    expect(goalKey("🧾 Less admin")).toBe("admin");
    expect(goalKey("🏡 More listings")).toBe("listings");
    expect(goalKey("📣 Better marketing")).toBe("marketing");
    expect(goalKey("listings")).toBe("listings");
    expect(goalKey("")).toBeNull();
    expect(goalKey(undefined)).toBeNull();
    expect(goalKey("something else entirely")).toBeNull();
  });

  it("puts the goal's chips first without repeating the defaults", () => {
    expect(suggestionKeys("followup")).toEqual(["checkIn", "coldLeads", "justListed", "planDay"]);
    expect(suggestionKeys("leads")).toEqual(["findLeads", "sphereReach", "checkIn", "justListed"]);
    expect(suggestionKeys(null)).toEqual(["checkIn", "justListed", "planDay"]);
  });

  it("floats the goal's priorities to the top, keeping each group's order", () => {
    const items = [
      { id: "a", recommendation_type: "transaction_deadline" },
      { id: "b", recommendation_type: "commission_missing" },
      { id: "c", recommendation_type: "missed_calls" },
      { id: "d", recommendation_type: "hot_lead" },
    ];
    expect(orderForGoal(items, "leads").map((i) => i.id)).toEqual(["c", "d", "a", "b"]);
    expect(orderForGoal(items, "admin").map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(orderForGoal(items, null).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(orderForGoal(items, "marketing").map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });
});
