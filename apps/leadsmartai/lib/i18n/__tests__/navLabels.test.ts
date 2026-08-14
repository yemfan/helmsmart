import { describe, expect, it } from "vitest";

import en from "@leadsmart/i18n/locale/en/dashboard_nav";
import zh from "@leadsmart/i18n/locale/zh-Hans/dashboard_nav";
import { translateNavSections } from "../navLabels";
import type { NavSection } from "@repo/ui";

/** Every label in the tree, groups and their children alike. */
function labelsOf(sections: NavSection[]): string[] {
  const out: string[] = [];
  for (const s of sections) {
    if (!("label" in s)) continue;
    out.push(s.label);
    if ("items" in s && Array.isArray(s.items)) out.push(...s.items.map((i) => i.label));
  }
  return out;
}

const SAMPLE: NavSection[] = [
  { kind: "divider" },
  { kind: "section-label", label: "Your AI Team" },
  { label: "Ask Max", href: "/dashboard/boss", match: ["/dashboard"] },
  {
    label: "Receptionist",
    items: [
      { label: "Overview", href: "/dashboard/receptionist" },
      { label: "Actions", href: "/dashboard/receptionist/actions" },
    ],
  },
] as NavSection[];

describe("translateNavSections", () => {
  it("translates group labels and their children", () => {
    const out = translateNavSections(SAMPLE, (s) => (zh as Record<string, string>)[s] ?? s);
    expect(labelsOf(out)).toEqual(["您的 AI 团队", "问 Max", "前台接待", "概览", "操作"]);
  });

  it("passes dividers through untouched", () => {
    const out = translateNavSections(SAMPLE, () => "x");
    expect(out[0]).toEqual({ kind: "divider" });
  });

  it("leaves routing, icons and match rules alone — only copy is localized", () => {
    const out = translateNavSections(SAMPLE, () => "translated");
    expect(out[2]).toMatchObject({ href: "/dashboard/boss", match: ["/dashboard"] });
    const group = out[3] as { items: Array<{ href: string }> };
    expect(group.items.map((i) => i.href)).toEqual([
      "/dashboard/receptionist",
      "/dashboard/receptionist/actions",
    ]);
  });

  it("falls back to the English label when a translation is missing", () => {
    const sections = [{ label: "Brand New Feature", href: "/x" }] as NavSection[];
    const out = translateNavSections(sections, (s) => (zh as Record<string, string>)[s] ?? s);
    expect(labelsOf(out)).toEqual(["Brand New Feature"]);
  });
});

describe("dashboard_nav namespace", () => {
  it("has a Chinese string for every English key — no half-translated sidebar", () => {
    const missing = Object.keys(en).filter((k) => !(zh as Record<string, string>)[k]?.trim());
    expect(missing).toEqual([]);
  });

  it("has no Chinese keys the English file doesn't declare (catches typos/drift)", () => {
    const extra = Object.keys(zh).filter((k) => !(k in en));
    expect(extra).toEqual([]);
  });

  it("keys contain no dots or colons — i18next would read those as key paths", () => {
    const bad = Object.keys(en).filter((k) => k.includes(".") || k.includes(":"));
    expect(bad).toEqual([]);
  });
});
