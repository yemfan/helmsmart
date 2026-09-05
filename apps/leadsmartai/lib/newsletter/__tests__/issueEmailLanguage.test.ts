import { describe, expect, it, vi } from "vitest";

// The renderer is pure, but it reaches into generateDigest for the category
// labels and that module is `server-only`. Repo convention (see
// lib/boss/runs/__tests__/engine.test.ts) is to neutralize the guard.
vi.mock("server-only", () => ({}));

import { renderIssueEmail } from "@/lib/newsletter/emailTemplate";
import { categoryLabel } from "@/lib/newsletter/generateDigest";
import type { NewsletterIssue } from "@/lib/newsletter/assembleIssue";

/**
 * The weekly digest is generated once per language, and the email around it has
 * to follow. What this pins down is the seam between the two: the renderer
 * reads the language off the DIGEST, so a reader whose variant is missing gets
 * a coherent English email rather than English copy in a Chinese frame.
 */

function issue(language: string, overrides: Partial<NewsletterIssue> = {}): NewsletterIssue {
  return {
    weekOf: "2026-09-07",
    digest: {
      id: "d1",
      week_of: "2026-09-07",
      language,
      title: language === "zh-Hans" ? "本周房市要闻" : "Rates ease into fall",
      intro: null,
      items: [
        {
          headline: "30-year fixed slips to 6.1%",
          summary: "Freddie Mac's survey put the average at 6.1%.",
          key_point: "Cheapest borrowing since spring.",
          why_it_matters: "A $500k loan costs about $60 less a month.",
          category: "economy_rates",
          state: null,
          scope: "national",
          source_url: "https://www.freddiemac.com/pmms",
          publisher: "Freddie Mac",
          image_url: null,
        },
      ],
      sources: [],
      status: "published",
      created_at: "2026-09-07T00:00:00Z",
    } as any,
    region: {
      slug: "national",
      name: "the U.S.",
      level: "national",
      stateCode: null,
      stats: [],
    } as any,
    ...overrides,
  };
}

const BASE = {
  subscription: { email: "reader@example.com", region_name: null, region_code: "US" },
  unsubscribeUrl: "https://www.closebossai.com/api/newsletter/unsubscribe?token=t",
  mailingAddress: "1 Market St, San Francisco, CA",
  siteUrl: "https://www.closebossai.com",
};

describe("renderIssueEmail language", () => {
  it("writes the whole English shell for an English digest", () => {
    const out = renderIssueEmail({ issue: issue("en"), ...BASE });
    expect(out.subject).toContain("This Week in Housing");
    expect(out.text).toContain("What it means for you:");
    expect(out.html).toContain("Read the full issue online");
    expect(out.html).toContain(">Unsubscribe</a>");
  });

  it("writes the whole Chinese shell for a Chinese digest", () => {
    const out = renderIssueEmail({ issue: issue("zh-Hans"), ...BASE });
    expect(out.subject).toContain("本周房市");
    expect(out.subject).not.toContain("This Week in Housing");
    expect(out.text).toContain("这对你意味着什么：");
    expect(out.html).toContain("在线阅读完整内容");
    expect(out.html).toContain("退订");
    // The category badge sits beside translated headlines — it has to move too.
    expect(out.html).toContain("经济与利率");
  });

  it("keeps the unsubscribe LINK intact in either language", () => {
    for (const lang of ["en", "zh-Hans"]) {
      const out = renderIssueEmail({ issue: issue(lang), ...BASE });
      expect(out.html).toContain(BASE.unsubscribeUrl.replace(/&/g, "&amp;"));
      expect(out.text).toContain(BASE.unsubscribeUrl);
      expect(out.text).toContain(BASE.mailingAddress);
    }
  });

  it("keeps the citation URL verbatim — a translated source points at nothing", () => {
    const out = renderIssueEmail({ issue: issue("zh-Hans"), ...BASE });
    expect(out.text).toContain("https://www.freddiemac.com/pmms");
    expect(out.html).toContain("https://www.freddiemac.com/pmms");
  });

  it("follows the DIGEST, so a fallback week is English end to end", () => {
    // The send asked for Chinese; that week only published English, so
    // getDigestForReader handed back the English row. The renderer takes its
    // language from the row it was given and nothing else — there is no
    // argument that could put English copy inside Chinese chrome.
    const out = renderIssueEmail({ issue: issue("en"), ...BASE });
    expect(out.subject).toContain("This Week in Housing");
    expect(out.html).not.toContain("在线阅读完整内容");
  });

  it("treats an unknown or missing language as English", () => {
    for (const lang of ["", "fr", "zh-Hant"]) {
      const out = renderIssueEmail({ issue: issue(lang), ...BASE });
      expect(out.subject).toContain("This Week in Housing");
    }
  });
});

describe("categoryLabel", () => {
  it("translates the badge and falls back to English for anything else", () => {
    expect(categoryLabel("schools_education", "zh-Hans")).toBe("学区教育");
    expect(categoryLabel("schools_education", "zh-CN")).toBe("学区教育");
    expect(categoryLabel("schools_education", "en")).toBe("Schools");
    expect(categoryLabel("schools_education", null)).toBe("Schools");
    expect(categoryLabel("schools_education", "fr")).toBe("Schools");
  });
});
