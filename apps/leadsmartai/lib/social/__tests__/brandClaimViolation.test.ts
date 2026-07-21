import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: vi.fn(),
  isAnthropicConfigured: () => false,
}));

const { brandClaimViolation } = await import("../generateBrandPosts");

type Draft = Parameters<typeof brandClaimViolation>[0];

const draft = (hook: string, body = "", cta = "closebossai.com"): Draft => ({
  voice: "brand",
  title: "t",
  hook,
  body,
  hashtags: [],
  image_prompt: "",
  cta,
});

describe("brandClaimViolation", () => {
  it("passes honest copy about real capabilities", () => {
    expect(
      brandClaimViolation(
        draft(
          "A missed call is a missed commission.",
          "CloseBoss's AI Receptionist answers every call 24/7 — and the ones it can't, it texts back.",
        ),
      ),
    ).toBeNull();
    expect(
      brandClaimViolation(
        draft(
          "We made our entire 59-skill Realtor AI Skills Library free.",
          "Listing descriptions, CMAs, farm campaigns — no signup.",
        ),
      ),
    ).toBeNull();
  });

  // These two are the ACTUAL drafts that reached the prod library before being
  // caught by hand. They are the reason the autonomy/pipeline rules exist.
  it("catches the live-search fabrication that shipped once", () => {
    const why = brandClaimViolation(
      draft(
        "A buyer search only creates value if someone is watching it when a match hits.",
        "CloseBoss stores AI-powered house searches per client, so every buyer you're working with has a live search running on their behalf. When something relevant appears, it's tracked.",
      ),
    );
    expect(why).toMatch(/automation/i);
  });

  it("catches the cross-assistant pipeline overclaim that shipped once", () => {
    const why = brandClaimViolation(
      draft(
        "The problem with assembling five separate tools is that none of them talk to each other.",
        "A lead captured by the receptionist moves directly into the sales cadence. Everything is already connected because it was built that way from the start.",
      ),
    );
    expect(why).toMatch(/integration/i);
  });

  it("catches invented metrics but allows the sanctioned 59 and 24/7", () => {
    expect(brandClaimViolation(draft("Agents close 3x more deals."))).toMatch(/metric/i);
    expect(brandClaimViolation(draft("Save 10 hours a week."))).toMatch(/metric/i);
    expect(brandClaimViolation(draft("Our 59 skills, free."))).toBeNull();
  });

  it("catches competitor and brokerage names (trademark risk)", () => {
    expect(brandClaimViolation(draft("Better than Follow Up Boss."))).toMatch(/brand/i);
    expect(brandClaimViolation(draft("Trusted by RE/MAX agents."))).toMatch(/brand/i);
    expect(brandClaimViolation(draft("Unlike kvCORE, it just works."))).toMatch(/brand/i);
  });

  it("catches pricing and promised outcomes", () => {
    expect(brandClaimViolation(draft("Just $99 per month."))).toMatch(/pricing/i);
    expect(brandClaimViolation(draft("Start your free trial."))).toMatch(/pricing/i);
    expect(brandClaimViolation(draft("You will close more deals, guaranteed."))).toMatch(
      /outcome/i,
    );
  });

  it("screens the body and cta, not just the hook", () => {
    expect(brandClaimViolation(draft("A clean hook.", "It monitors the market for you."))).toMatch(
      /automation/i,
    );
    expect(brandClaimViolation(draft("A clean hook.", "Solid body.", "Only $49/mo"))).toMatch(
      /pricing/i,
    );
  });
});
