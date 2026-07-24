import { describe, expect, it } from "vitest";

import { buildComposeInstruction } from "../share";

/** Decode the `text=` param back out of the X intent URL. */
function tweetText(composeUrl: string | null): string {
  const m = (composeUrl ?? "").match(/[?&]text=([^&]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

const LONG =
  "Big news — the social media publishing tool is officially live in CloseBoss. " +
  "You can now auto-publish or schedule custom posts across multiple platforms, all from one " +
  "place. No more jumping between apps or copy-pasting into every platform manually. This is " +
  "something I've been really excited to get into your hands.";

describe("X share stays within 280", () => {
  it("trims a long caption so the tweet is postable", () => {
    const c = buildComposeInstruction({
      platform: "x",
      caption: LONG,
      hashtags: ["CloseBoss", "RealEstateMarketing"],
      shareUrl: "https://www.closebossai.com",
    });
    // X counts the url as 23; text + 24 (url + space) must fit 280.
    expect(tweetText(c.composeUrl).length).toBeLessThanOrEqual(280 - 24);
    // The hashtags survive the trim.
    expect(c.caption).toContain("#CloseBoss");
    expect(c.caption.endsWith("#RealEstateMarketing")).toBe(true);
    // Something was actually cut.
    expect(c.caption).toContain("…");
  });

  it("leaves a short caption untouched", () => {
    const c = buildComposeInstruction({
      platform: "x",
      caption: "Just listed a beautiful 3-bed in Pasadena.",
      hashtags: ["JustListed"],
      shareUrl: "https://www.closebossai.com",
    });
    expect(c.caption).toBe("Just listed a beautiful 3-bed in Pasadena. #JustListed");
    expect(c.caption).not.toContain("…");
  });
});
