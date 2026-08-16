import { describe, expect, it } from "vitest";

import en from "@leadsmart/i18n/locale/en/dashboard_nav";
import zh from "@leadsmart/i18n/locale/zh-Hans/dashboard_nav";
import enDash from "@leadsmart/i18n/locale/en/dashboard";
import zhDash from "@leadsmart/i18n/locale/zh-Hans/dashboard";
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

/** Flatten a nested namespace to dotted leaf paths, so nesting can't hide a gap. */
function leafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? leafKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("dashboard namespace (page copy)", () => {
  it("has a Chinese string for every English key, at every nesting level", () => {
    const enKeys = leafKeys(enDash as Record<string, unknown>);
    const zhKeys = new Set(leafKeys(zhDash as Record<string, unknown>));
    expect(enKeys.filter((k) => !zhKeys.has(k))).toEqual([]);
  });

  it("has no Chinese keys the English file doesn't declare", () => {
    const enKeys = new Set(leafKeys(enDash as Record<string, unknown>));
    expect(leafKeys(zhDash as Record<string, unknown>).filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it("leaves no Chinese value identical to its English source", () => {
    // A copy-paste that never got translated reads as "translated" to the
    // parity checks above but ships English to a Chinese-speaking agent.
    // Brand names and pure punctuation are legitimately identical.
    // Identical on purpose: product names, an arrow glyph, and an example URL.
    const ALLOWED = new Set([
      "topbar.askMax",
      "profile.backToDashboard",
      "branding.leadAdPlaceholder",
      "aiTeam.eyebrow",
      // Format examples, not copy: an MLS number and a bare URL scheme.
      "pages.newOpenHouse.mlsPlaceholder",
      "pages.newOpenHouse.urlPlaceholder",
    ]);
    const en = enDash as Record<string, unknown>;
    const zh = zhDash as Record<string, unknown>;
    const get = (o: Record<string, unknown>, path: string) =>
      path.split(".").reduce<unknown>((acc, seg) => (acc as Record<string, unknown>)?.[seg], o);
    const untranslated = leafKeys(en).filter(
      (k) => !ALLOWED.has(k) && get(en, k) === get(zh, k),
    );
    expect(untranslated).toEqual([]);
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
