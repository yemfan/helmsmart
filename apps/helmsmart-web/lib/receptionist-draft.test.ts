import { describe, expect, it } from "vitest";

import { fallbackDraft, shapeDraft, type ReceptionistDraft } from "@/lib/receptionist-draft";

/**
 * Two things that must hold whatever the model does.
 *
 * The fallback is the reason the setup step can never stall: no key, no site,
 * a 401, a timeout — the owner still gets editable sentences. And the shaper
 * is where untrusted model output stops being untrusted: it lands in the
 * receptionist's prompt and in `upsertAppointmentType`, so it is capped,
 * bounded and clamped here rather than trusted there.
 */

const INPUT = {
  businessName: "Acme Plumbing",
  category: "Plumbing",
  location: "Austin, TX",
  description: "We fix boilers.",
};

describe("fallbackDraft", () => {
  it("produces something editable from nothing but a name", () => {
    const d = fallbackDraft({ businessName: "Acme Plumbing" });
    expect(d.greeting).toContain("Acme Plumbing");
    expect(d.context).toContain("Acme Plumbing");
    expect(d.appointmentTypes.length).toBeGreaterThan(0);
    expect(d.source).toBe("defaults");
  });

  it("says it worked from the description when there was one", () => {
    expect(fallbackDraft(INPUT).source).toBe("description");
  });

  it("keeps a website it managed to read even when the AI never ran", () => {
    // Read successfully, then no key: the URL is still worth having in the
    // briefing, and throwing it away was the old behaviour.
    const d = fallbackDraft(INPUT, null, "https://acme.com/");
    expect(d.context).toContain("https://acme.com/");
    expect(d.siteUrl).toBe("https://acme.com/");
  });

  it("carries the reason a website could not be read", () => {
    expect(fallbackDraft(INPUT, "dns-failed").siteFailure).toBe("dns-failed");
    expect(fallbackDraft(INPUT, "dns-failed").siteUrl).toBeNull();
  });
});

describe("shapeDraft", () => {
  const base: ReceptionistDraft = fallbackDraft(INPUT);

  it("keeps the base when the model returned nothing usable", () => {
    for (const junk of [null, undefined, "a string", 42, []]) {
      expect(shapeDraft(junk, base), String(junk)).toEqual(base);
    }
  });

  it("clamps a duration to the same range the save clamps to", () => {
    const out = shapeDraft(
      { appointmentTypes: [{ name: "Marathon", durationMinutes: 100000 }, { name: "Blink", durationMinutes: 1 }] },
      base,
    );
    expect(out.appointmentTypes[0].durationMinutes).toBe(480);
    expect(out.appointmentTypes[1].durationMinutes).toBe(5);
  });

  it("defaults a missing or nonsense duration rather than storing NaN", () => {
    const out = shapeDraft({ appointmentTypes: [{ name: "Visit", durationMinutes: "soon" }] }, base);
    expect(out.appointmentTypes[0].durationMinutes).toBe(30);
  });

  it("bounds the lists", () => {
    const out = shapeDraft(
      {
        services: Array.from({ length: 50 }, (_, i) => `service ${i}`),
        faqs: Array.from({ length: 50 }, (_, i) => ({ title: `q${i}`, content: `a${i}` })),
        appointmentTypes: Array.from({ length: 50 }, (_, i) => ({ name: `t${i}`, durationMinutes: 30 })),
      },
      base,
    );
    expect(out.services.length).toBeLessThanOrEqual(6);
    expect(out.faqs.length).toBeLessThanOrEqual(4);
    expect(out.appointmentTypes.length).toBeLessThanOrEqual(3);
  });

  it("drops half-written entries instead of saving a blank answer", () => {
    const out = shapeDraft(
      { faqs: [{ title: "Do you do emergencies?", content: "" }, { title: "", content: "Yes" }, { title: "Cost?", content: "Free estimates." }] },
      base,
    );
    expect(out.faqs).toEqual([{ title: "Cost?", content: "Free estimates." }]);
  });

  it("accepts question/answer as well as title/content, because models pick either", () => {
    const out = shapeDraft({ faqs: [{ question: "Hours?", answer: "9 to 5." }] }, base);
    expect(out.faqs).toEqual([{ title: "Hours?", content: "9 to 5." }]);
  });

  it("refuses a context too short to be a briefing", () => {
    expect(shapeDraft({ context: "ok" }, base).context).toBe(base.context);
  });

  it("never leaves the owner with no appointment type at all", () => {
    expect(shapeDraft({ appointmentTypes: [{ name: "" }] }, base).appointmentTypes).toEqual(base.appointmentTypes);
  });
});
