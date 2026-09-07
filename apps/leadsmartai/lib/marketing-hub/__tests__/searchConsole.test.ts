import { describe, expect, it } from "vitest";
import { gscSiteFor, hubPagePrefixes, hubSearchSummary } from "../searchConsole";

const origin = "https://www.closebossai.com";

describe("gscSiteFor", () => {
  it("names the domain property without www, and nothing for hosts Search Console would not have", () => {
    expect(gscSiteFor("https://www.closebossai.com")).toBe("sc-domain:closebossai.com");
    expect(gscSiteFor("https://closebossai.com/")).toBe("sc-domain:closebossai.com");
    expect(gscSiteFor("http://localhost:3000")).toBeNull();
    expect(gscSiteFor("https://cb-abc.vercel.app")).toBeNull();
    expect(gscSiteFor("nonsense")).toBeNull();
  });
});

describe("hubSearchSummary", () => {
  const pageRows = [
    { page: `${origin}/@michaelye`, date: "2026-09-01", clicks: 2, impressions: 40, position: 8.0 },
    { page: `${origin}/@michaelye/`, date: "2026-09-03", clicks: 0, impressions: 10, position: 12.0 },
    { page: `${origin}/%40michaelye/area/alhambra-ca`, date: "2026-09-04", clicks: 3, impressions: 50, position: 4.0 },
    // Another agent whose handle starts with the same letters: not ours.
    { page: `${origin}/@michaelyee`, date: "2026-09-04", clicks: 9, impressions: 900, position: 1.0 },
    { page: `${origin}/market-report/19140`, date: "2026-09-05", clicks: 0, impressions: 2, position: 30 },
  ];
  const queryRows = [
    { page: `${origin}/@michaelye`, query: "michael ye realtor", date: "2026-09-01", clicks: 2, impressions: 20, position: 3 },
    { page: `${origin}/%40michaelye/area/alhambra-ca`, query: "alhambra homes", date: "2026-09-04", clicks: 3, impressions: 40, position: 5 },
    { page: `${origin}/@michaelye`, query: "alhambra homes", date: "2026-09-02", clicks: 0, impressions: 15, position: 9 },
    { page: `${origin}/@michaelyee`, query: "someone else", date: "2026-09-04", clicks: 9, impressions: 900, position: 1 },
  ];

  it("sums only this hub's pages, either spelling of @, and weights position by impressions", () => {
    const s = hubSearchSummary({ origin, username: "michaelye", pageRows, queryRows })!;
    expect(s.impressions).toBe(100);
    expect(s.clicks).toBe(5);
    expect(s.ctr).toBe(0.05);
    // (8*40 + 12*10 + 4*50) / 100 = 6.4
    expect(s.position).toBe(6.4);
    expect(s.pages).toBe(2);
    expect(s.lastDate).toBe("2026-09-04");
    expect(s.topPages.map((p) => p.path)).toEqual(["/area/alhambra-ca", "/"]);
    expect(s.topQueries).toEqual([
      { query: "alhambra homes", impressions: 55, clicks: 3, position: 6.1 },
      { query: "michael ye realtor", impressions: 20, clicks: 2, position: 3 },
    ]);
  });

  it("is null, not zeros, when Google never showed the hub", () => {
    expect(hubSearchSummary({ origin, username: "nobody", pageRows, queryRows })).toBeNull();
    expect(hubSearchSummary({ origin, username: "", pageRows, queryRows })).toBeNull();
    expect(hubPagePrefixes(origin, " ")).toEqual([]);
  });
});
