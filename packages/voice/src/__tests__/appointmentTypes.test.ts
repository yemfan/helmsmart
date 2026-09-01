import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_TYPES,
  appointmentTypeById,
  callerKind,
  describeAppointmentTypes,
  normalizeAppointmentMode,
  normalizeAppointmentType,
  offerableAppointmentTypes,
  resolveAppointmentMode,
} from "../appointmentTypes";

const ids = (list: { id: string }[]) => list.map((t) => t.id);

describe("callerKind", () => {
  it("reads what contacts.lead_type actually holds", () => {
    expect(callerKind("buyer")).toBe("buyer");
    expect(callerKind("Seller")).toBe("seller");
    expect(callerKind(" renter ")).toBe("renter");
  });

  it("treats anything else as unknown rather than guessing", () => {
    for (const v of [null, undefined, "", "agent_prospect", "lead"]) {
      expect(callerKind(v)).toBe("unknown");
    }
  });
});

describe("offerableAppointmentTypes", () => {
  it("does not offer a seller a showing", () => {
    // The bug this exists for: one hardcoded sentence read to everyone, so a
    // seller asking what their house is worth was offered a property showing.
    const offered = ids(offerableAppointmentTypes("seller"));
    expect(offered).not.toContain("showing");
    expect(offered).not.toContain("buyer_consultation");
    expect(offered).toEqual(["seller_consultation", "home_valuation", "general_meeting"]);
  });

  it("does not offer a buyer a valuation", () => {
    const offered = ids(offerableAppointmentTypes("buyer"));
    expect(offered).not.toContain("home_valuation");
    expect(offered).not.toContain("seller_consultation");
    expect(offered).toEqual(["buyer_consultation", "showing", "general_meeting"]);
  });

  it("gives a renter the buyer side", () => {
    expect(ids(offerableAppointmentTypes("renter"))).toContain("showing");
    expect(ids(offerableAppointmentTypes("renter"))).not.toContain("home_valuation");
  });

  it("offers everything when we do not know who is calling", () => {
    expect(offerableAppointmentTypes("unknown")).toHaveLength(APPOINTMENT_TYPES.length);
  });
});

describe("modes", () => {
  it("keeps a showing in person, because you cannot show a house down the phone", () => {
    expect(appointmentTypeById("showing")!.modes).toEqual(["in_person"]);
  });

  it("lets a consultation happen any of the three ways", () => {
    for (const id of ["buyer_consultation", "seller_consultation", "general_meeting"]) {
      expect(appointmentTypeById(id)!.modes).toEqual(["in_person", "video", "phone"]);
    }
  });

  it("reads the mode out of what the caller said", () => {
    expect(normalizeAppointmentMode("can we do it over zoom")).toBe("video");
    expect(normalizeAppointmentMode("just call me")).toBe("phone");
    expect(normalizeAppointmentMode("I'll come in person")).toBe("in_person");
    expect(normalizeAppointmentMode("当面")).toBe("in_person");
    expect(normalizeAppointmentMode("视频")).toBe("video");
  });

  it("says nothing when the caller did not say", () => {
    expect(normalizeAppointmentMode("")).toBeNull();
    expect(normalizeAppointmentMode("next tuesday")).toBeNull();
  });

  it("refuses a mode the purpose cannot honour", () => {
    // "phone showing" is not a thing; recording it would make the calendar lie.
    const showing = appointmentTypeById("showing")!;
    expect(resolveAppointmentMode(showing, "phone")).toBe("in_person");
    expect(resolveAppointmentMode(showing, "video")).toBe("in_person");
  });

  it("honours a mode the purpose does support", () => {
    const consult = appointmentTypeById("buyer_consultation")!;
    expect(resolveAppointmentMode(consult, "video")).toBe("video");
    expect(resolveAppointmentMode(consult, null)).toBe("in_person");
  });
});

describe("normalizeAppointmentType", () => {
  it("keeps the stored value countable instead of forty spellings of showing", () => {
    expect(normalizeAppointmentType("showing")?.id).toBe("showing");
    expect(normalizeAppointmentType("Property Showing")?.id).toBe("showing");
    expect(normalizeAppointmentType("come tour the house")?.id).toBe("showing");
  });

  it("understands what a seller is asking for", () => {
    expect(normalizeAppointmentType("what's it worth")?.id).toBe("home_valuation");
    expect(normalizeAppointmentType("appraisal")?.id).toBe("home_valuation");
    expect(normalizeAppointmentType("listing consultation")?.id).toBe("seller_consultation");
  });

  it("understands Chinese labels", () => {
    expect(normalizeAppointmentType("看房")?.id).toBe("showing");
    expect(normalizeAppointmentType("房屋估值")?.id).toBe("home_valuation");
  });

  it("does not mistake a MODE for a purpose", () => {
    // "video meeting" says how, not what. It must not become a purpose, or the
    // two columns collapse back into one.
    expect(normalizeAppointmentType("zoom")).toBeNull();
    expect(normalizeAppointmentMode("zoom")).toBe("video");
  });

  it("returns null rather than guessing", () => {
    expect(normalizeAppointmentType("")).toBeNull();
    expect(normalizeAppointmentType("something else entirely")).toBeNull();
  });
});

describe("describeAppointmentTypes", () => {
  it("spells durations as words, because she reads this aloud", () => {
    const text = describeAppointmentTypes(offerableAppointmentTypes("buyer"));
    expect(text).toContain("thirty minutes");
    expect(text).not.toMatch(/\(30 /);
  });

  it("names the modes each purpose allows", () => {
    const text = describeAppointmentTypes(offerableAppointmentTypes("buyer"));
    expect(text).toContain("property showing (thirty minutes, in person)");
    expect(text).toContain("in person or video or phone");
  });

  it("tells her not to ask about mode when only one applies", () => {
    const text = describeAppointmentTypes(offerableAppointmentTypes("buyer"));
    expect(text).toContain("in person by definition, so do not ask");
  });

  it("offers a seller their own list", () => {
    const text = describeAppointmentTypes(offerableAppointmentTypes("seller"));
    expect(text).toContain("home valuation");
    expect(text).not.toContain("property showing");
  });

  it("falls back to taking a message when booking is off", () => {
    expect(describeAppointmentTypes([])).toContain("take a message");
  });
});
