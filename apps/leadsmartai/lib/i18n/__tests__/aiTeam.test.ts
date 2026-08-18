import { describe, expect, it } from "vitest";
import { AI_TEAM } from "@/lib/closeboss/team";
import { SKILLS } from "@helm/pack-real-estate";
import en from "@leadsmart/i18n/locale/en/dashboard";
import zh from "@leadsmart/i18n/locale/zh-Hans/dashboard";

/**
 * The AI Team page renders two things it cannot translate in place: the roster
 * (pack config, English at module scope) and the skill rows (from the
 * `ai_skills` table). Both are looked up — the roster by assistant `type`, the
 * skills by `key` — and both fall back to English, silently, when a lookup
 * misses. These tests are what makes a miss loud.
 *
 * SKILLS is the pack catalogue the `ai_skills` rows are seeded from, so adding
 * a skill to the pack without translating it fails here.
 */

type Team = {
  role: Record<string, string>;
  personality: Record<string, string>;
  skill: Record<string, { name: string; desc: string }>;
};
const team = { en: (en as { aiTeam: Team }).aiTeam, "zh-Hans": (zh as { aiTeam: Team }).aiTeam };
const LOCALES = ["en", "zh-Hans"] as const;

describe("AI Team translations", () => {
  it("covers every assistant's role and personality", () => {
    for (const loc of LOCALES) {
      for (const a of AI_TEAM) {
        expect(team[loc].role[a.type], `${loc} role · ${a.type}`).toBeTruthy();
        expect(team[loc].personality[a.type], `${loc} personality · ${a.type}`).toBeTruthy();
      }
    }
  });

  it("covers every skill in the pack catalogue", () => {
    for (const loc of LOCALES) {
      for (const s of SKILLS) {
        expect(team[loc].skill[s.key]?.name, `${loc} name · ${s.key}`).toBeTruthy();
        expect(team[loc].skill[s.key]?.desc, `${loc} desc · ${s.key}`).toBeTruthy();
      }
    }
  });

  it("keeps the Chinese actually translated", () => {
    for (const a of AI_TEAM) {
      expect(team["zh-Hans"].personality[a.type], a.type).not.toBe(team.en.personality[a.type]);
    }
    for (const s of SKILLS) {
      expect(team["zh-Hans"].skill[s.key].desc, s.key).not.toBe(team.en.skill[s.key].desc);
    }
  });

  it("does not put REALTOR® in the Chinese copy", () => {
    // REALTOR® is a NAR collective mark. The English pack copy uses it; the
    // Chinese says 经纪人 ("agent"), which is both the natural term and free of
    // that entanglement. See the brokerage-trademark framing rule.
    for (const s of SKILLS) {
      expect(team["zh-Hans"].skill[s.key].desc, s.key).not.toMatch(/Realtor/i);
    }
  });
});
