import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A runtime key needs its whole domain translated, or it prints itself.
 *
 * `missingKeys.test.ts` walks from every LITERAL call site to the bundle, and
 * says so in its own docs: a key built at runtime cannot be resolved
 * statically, so it is exempt. That exemption is where this shipped from.
 *
 * The mobile Posts and Scheduled screens label a post with
 * `t(\`platforms.${post.platform}\`)`. The bundle carried facebook, instagram
 * and linkedin; the publisher had been writing threads (56 rows) and tiktok
 * (18) for weeks. So a Chinese-locale agent opened 定时发布 and read
 * `platforms.threads`, and 帖子 showed `marketing_assistant_social` as the
 * trigger. Nothing caught it: the residual-English scans look for English and
 * a raw key is not English; the parity checks compare the two locales to each
 * other and a key missing from both is perfectly consistent; the mobile types
 * claimed the platform was only ever one of three, so the compiler agreed.
 *
 * This walks the third way: from the DOMAIN to the bundle. The platform list
 * is read out of `socialPlatform.ts` rather than repeated here, so widening
 * the union without translating it fails.
 *
 * Unknown values are deliberately NOT required to be listed. `platformLabel`
 * falls back to display casing and `triggerLabel` to nothing, so a new value
 * degrades to "Google" or to silence — never to a slug.
 */

const LOCALES = join(__dirname, "..", "..", "..", "..", "..", "packages", "i18n", "locales");
const MOBILE = join(__dirname, "..", "..", "..", "..", "leadsmart-mobile");
const NS = "mobile_misc_screens";
const LOCALE_NAMES = ["en", "zh-Hans"] as const;

type Json = Record<string, unknown>;

function bundle(locale: string): Json {
  return JSON.parse(readFileSync(join(LOCALES, locale, `${NS}.json`), "utf8")) as Json;
}

function at(obj: Json, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Json)[k]), obj);
}

/** The `MobileSocialPlatform` union, read from source so it cannot drift. */
function platformUnion(): string[] {
  const src = readFileSync(join(MOBILE, "lib", "socialPlatform.ts"), "utf8");
  const block = src.match(/export type MobileSocialPlatform =([\s\S]*?);/);
  expect(block, "MobileSocialPlatform union not found in socialPlatform.ts").toBeTruthy();
  const values = [...block![1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  expect(values.length, "union parsed as empty").toBeGreaterThan(3);
  return values;
}

/**
 * Trigger kinds the publisher actually writes to `lead_posts.trigger_kind`.
 * Sourced from a `grep` for `trigger_kind:`/`triggerKind:` across the server
 * plus the distinct values in production. Quick Post's own eight
 * (new_listing … by_address) are covered by the literal-key test through the
 * composer, and are included here because the same map serves both screens.
 */
const TRIGGER_KINDS = [
  "new_listing",
  "open_house",
  "price_drop",
  "just_sold",
  "market_update",
  "testimonial",
  "custom",
  "by_address",
  "manual",
  "weekly_schedule",
  "marketing_assistant_social",
  "marketing_assistant_reel",
  "marketing_assistant_ad",
  "marketing_assistant_carousel",
  "ai_team_announcement",
  "transaction_listing",
];

describe("mobile runtime key domains", () => {
  it("translates every platform the app can publish to", () => {
    const missing: string[] = [];
    for (const locale of LOCALE_NAMES) {
      const b = bundle(locale);
      for (const p of platformUnion()) {
        if (typeof at(b, `platforms.${p}`) !== "string") missing.push(`${locale}: platforms.${p}`);
      }
    }
    expect(missing, `\n${missing.join("\n")}\n`).toEqual([]);
  });

  it("translates every trigger kind the publisher writes", () => {
    const missing: string[] = [];
    for (const locale of LOCALE_NAMES) {
      const b = bundle(locale);
      for (const k of TRIGGER_KINDS) {
        if (typeof at(b, `post_history.triggers.${k}`) !== "string") {
          missing.push(`${locale}: post_history.triggers.${k}`);
        }
      }
    }
    expect(missing, `\n${missing.join("\n")}\n`).toEqual([]);
  });

  it("keeps a fallback on both helpers, so an unknown value is never a slug", () => {
    const src = readFileSync(join(MOBILE, "lib", "socialPlatform.ts"), "utf8");
    // platformLabel → display casing; triggerLabel → "" then null.
    expect(src).toMatch(/platforms\.\$\{platform\}`,\s*\{\s*defaultValue:\s*prettyPlatform\(platform\)/);
    expect(src).toMatch(/post_history\.triggers\.\$\{k\}`,\s*\{\s*defaultValue:\s*""/);
  });

  it("resolves the two values from the bug report", () => {
    for (const locale of LOCALE_NAMES) {
      const b = bundle(locale);
      expect(at(b, "platforms.threads"), `${locale} platforms.threads`).toBe("Threads");
      expect(typeof at(b, "post_history.triggers.marketing_assistant_social")).toBe("string");
    }
  });
});
