import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: vi.fn(),
  isAnthropicConfigured: () => false,
}));

const { carouselClaimViolation } = await import("../generateCarousel");

type Draft = Parameters<typeof carouselClaimViolation>[0];
type Slide = Draft["slides"][number];

const slide = (heading: string, body = ""): Slide => ({ heading, body });

/** Build a valid-shaped carousel draft with the given caption + point slides. */
const draft = (caption: string, points: Slide[] = [slide("A point", "One line.")]): Draft => ({
  voice: "brand",
  title: "t",
  caption,
  slides: [slide("Cover hook"), ...points, slide("Save this.", "What's your take?")],
  hashtags: [],
});

describe("carouselClaimViolation", () => {
  it("passes honest copy about real capabilities", () => {
    expect(
      carouselClaimViolation(
        draft("A missed call is a missed commission. What time did your last lead call?", [
          slide("Every call, answered", "The AI Receptionist picks up 24/7."),
          slide("The ones it can't", "It texts them back so the lead never goes cold."),
        ]),
      ),
    ).toBeNull();
  });

  it("catches invented metrics but allows the sanctioned 59 and 24/7", () => {
    expect(
      carouselClaimViolation(draft("Hook.", [slide("Close more", "Agents close 3x more deals.")])),
    ).toMatch(/metric/i);
    expect(
      carouselClaimViolation(draft("Our 59-skill library is free.", [slide("59 skills", "No signup.")])),
    ).toBeNull();
  });

  it("catches competitor and brokerage names in a slide (trademark risk)", () => {
    expect(
      carouselClaimViolation(draft("Hook.", [slide("Better than Follow Up Boss", "Really.")])),
    ).toMatch(/brand/i);
    expect(
      carouselClaimViolation(draft("Trusted by RE/MAX agents.", [slide("A point", "x")])),
    ).toMatch(/brand/i);
  });

  it("catches pricing in the caption and promised outcomes in a slide", () => {
    expect(carouselClaimViolation(draft("Just $99 per month.", []))).toMatch(/pricing/i);
    expect(
      carouselClaimViolation(draft("Hook.", [slide("Guaranteed", "You will close more deals, guaranteed.")])),
    ).toMatch(/outcome/i);
  });

  it("screens every slide, not just the caption or cover", () => {
    // Violation buried in a middle point slide's body.
    expect(
      carouselClaimViolation(
        draft("A clean caption.", [
          slide("Point one", "Solid."),
          slide("Point two", "It monitors the market for you."),
        ]),
      ),
    ).toMatch(/automation/i);
  });
});
