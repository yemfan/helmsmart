import { describe, expect, it } from "vitest";
import {
  buildSmsContactPatch,
  leadTypeFromIntent,
} from "../extractedPatch";

describe("buildSmsContactPatch", () => {
  it("saves the answers the assistant worked to get", () => {
    // The regression this exists for: a real conversation in which the lead
    // gave an area and a budget range, and the contact record afterwards
    // showed neither, because the mapper only ever wrote name/email/address.
    const patch = buildSmsContactPatch(
      {
        searchLocation: "Rowland Heights",
        budgetMin: 1_000_000,
        budgetMax: 1_200_000,
        timeline: "2 months",
      },
      "buyer_listing_inquiry",
      { name: "Angel Zhao" },
    );

    expect(patch.search_location).toBe("Rowland Heights");
    expect(patch.price_min).toBe(1_000_000);
    expect(patch.price_max).toBe(1_200_000);
    expect(patch.timeline).toBe("2 months");
    expect(patch.lead_type).toBe("buyer");
  });

  it("keeps an area out of the street-address field", () => {
    const patch = buildSmsContactPatch(
      { searchLocation: "Alhambra", propertyAddress: "1613 S Atlantic Blvd" },
      "buyer_listing_inquiry",
      {},
    );
    expect(patch.search_location).toBe("Alhambra");
    expect(patch.property_address).toBe("1613 S Atlantic Blvd");
  });

  it("never overwrites identity already on file", () => {
    const patch = buildSmsContactPatch(
      { name: "Mike", email: "mike@other.com", preferredLanguage: "en" },
      "unknown",
      { name: "Michael Ye", email: "michael@real.com", preferred_language: "zh" },
    );
    expect(patch.name).toBeUndefined();
    expect(patch.email).toBeUndefined();
    expect(patch.preferred_language).toBeUndefined();
  });

  it("fills identity when it is blank", () => {
    const patch = buildSmsContactPatch(
      { name: "Mike", email: "mike@x.com", preferredLanguage: "zh" },
      "unknown",
      { name: "  ", email: null },
    );
    expect(patch.name).toBe("Mike");
    expect(patch.email).toBe("mike@x.com");
    expect(patch.preferred_language).toBe("zh");
  });

  it("lets a revised requirement win", () => {
    // Unlike a name, a budget legitimately changes mid-conversation.
    const patch = buildSmsContactPatch(
      { budgetMax: 1_400_000 },
      "buyer_listing_inquiry",
      { name: "Angel Zhao" },
    );
    expect(patch.price_max).toBe(1_400_000);
  });

  it("rejects a budget that is obviously a misparse", () => {
    // "1.2 million" written as 1.2 would otherwise brand the lead unqualified.
    const patch = buildSmsContactPatch({ budgetMin: 1.2, budgetMax: 0 }, "unknown", {});
    expect(patch.price_min).toBeUndefined();
    expect(patch.price_max).toBeUndefined();
  });

  it("straightens a reversed range", () => {
    const patch = buildSmsContactPatch(
      { budgetMin: 1_200_000, budgetMax: 1_000_000 },
      "unknown",
      {},
    );
    expect(patch.price_min).toBe(1_000_000);
    expect(patch.price_max).toBe(1_200_000);
  });

  it("does not reclassify a lead the agent already typed", () => {
    const patch = buildSmsContactPatch({}, "buyer_listing_inquiry", { lead_type: "seller" });
    expect(patch.lead_type).toBeUndefined();
    expect(patch.intent).toBe("buyer_listing_inquiry");
  });

  it("writes nothing when the lead said nothing new", () => {
    expect(buildSmsContactPatch({}, "unknown", {})).toEqual({});
    expect(buildSmsContactPatch(null, "unknown", null)).toEqual({});
  });

  it("rounds bedrooms but keeps half baths", () => {
    const patch = buildSmsContactPatch({ beds: 3, baths: 2.5 }, "unknown", {});
    expect(patch.beds).toBe(3);
    expect(patch.baths).toBe(2.5);
  });
});

describe("leadTypeFromIntent", () => {
  it("maps the intents that imply a side of the deal", () => {
    expect(leadTypeFromIntent("buyer_listing_inquiry")).toBe("buyer");
    expect(leadTypeFromIntent("buyer_financing")).toBe("buyer");
    expect(leadTypeFromIntent("seller_home_value")).toBe("seller");
    expect(leadTypeFromIntent("seller_list_home")).toBe("seller");
  });

  it("leaves the rest alone", () => {
    expect(leadTypeFromIntent("appointment")).toBeNull();
    expect(leadTypeFromIntent("support")).toBeNull();
    expect(leadTypeFromIntent("unknown")).toBeNull();
  });
});
