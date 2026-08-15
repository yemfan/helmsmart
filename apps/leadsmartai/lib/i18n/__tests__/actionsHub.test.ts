import { describe, expect, it } from "vitest";
import { TEAM_ACTIONS } from "@/lib/team-actions";
import navEn from "@leadsmart/i18n/locale/en/dashboard_nav";
import navZh from "@leadsmart/i18n/locale/zh-Hans/dashboard_nav";
import dashEn from "@leadsmart/i18n/locale/en/dashboard";
import dashZh from "@leadsmart/i18n/locale/zh-Hans/dashboard";

/**
 * TEAM_ACTIONS is authored in English at module scope, so the Actions hub can
 * only translate it by lookup. Nothing in the type system connects the two —
 * adding an action is a one-line edit that silently ships English to the
 * Chinese dashboard. These tests are that connection.
 */

const actions = Object.values(TEAM_ACTIONS);
const nav = { en: navEn as Record<string, string>, "zh-Hans": navZh as Record<string, string> };
const desc = {
  en: (dashEn as { actionsHub: { desc: Record<string, string> } }).actionsHub.desc,
  "zh-Hans": (dashZh as { actionsHub: { desc: Record<string, string> } }).actionsHub.desc,
};
const LOCALES = ["en", "zh-Hans"] as const;

describe("Actions hub translations", () => {
  it("covers every employee title", () => {
    for (const loc of LOCALES) {
      for (const m of actions) expect(nav[loc][m.title], `${loc} · ${m.title}`).toBeTruthy();
    }
  });

  it("covers every action label", () => {
    for (const loc of LOCALES) {
      for (const m of actions) {
        for (const a of m.actions) expect(nav[loc][a.label], `${loc} · ${a.label}`).toBeTruthy();
      }
    }
  });

  it("covers every action description, keyed by href", () => {
    for (const loc of LOCALES) {
      for (const m of actions) {
        for (const a of m.actions) expect(desc[loc][a.href], `${loc} · ${a.href}`).toBeTruthy();
      }
    }
  });

  it("keeps descriptions actually translated", () => {
    for (const m of actions) {
      for (const a of m.actions) {
        expect(desc["zh-Hans"][a.href], a.href).not.toBe(desc.en[a.href]);
      }
    }
  });

  it("uses hrefs i18next can look up", () => {
    // The desc key is built as `actionsHub.desc.${href}`, and i18next splits
    // keys on ".". A dot in an href would split the path and quietly miss.
    for (const m of actions) {
      for (const a of m.actions) expect(a.href, a.href).not.toContain(".");
    }
  });
});
