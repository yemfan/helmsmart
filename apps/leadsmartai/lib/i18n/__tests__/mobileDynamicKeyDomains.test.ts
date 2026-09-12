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
/** The web's own type files — the source of the enums the app renders. */
const WEB_LIB = join(__dirname, "..", "..");
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

  /**
   * Three more families, all found the same way — by reading App Store
   * screenshots, not by any check in this directory. `task_type` printed
   * "hub_follow_up" beside a due date; the offer desk relied on CSS
   * `text-transform: capitalize` over raw slugs, which renders "fha" as
   * "Fha" and "va" as "Va" to an audience that reads FHA and VA daily.
   */
  it("translates every task type the server writes", () => {
    const kinds = [
      "call", "follow_up", "voice_follow_up", "hub_follow_up",
      "missed_call_callback", "boss_playbook", "boss_instruction",
      "boss_handoff", "support_ticket",
    ];
    const missing: string[] = [];
    for (const locale of LOCALE_NAMES) {
      const b = JSON.parse(
        readFileSync(join(LOCALES, locale, "task_calendar_components.json"), "utf8"),
      ) as Json;
      for (const k of kinds) {
        if (typeof at(b, `task_card.types.${k}`) !== "string") {
          missing.push(`${locale}: task_card.types.${k}`);
        }
      }
    }
    expect(missing, `\n${missing.join("\n")}\n`).toEqual([]);
  });

  it("translates the offer-desk and CMA option chips, acronyms intact", () => {
    const expected: Array<[string, string | null]> = [
      ["offerDesk.financingOptions.cash", null],
      ["offerDesk.financingOptions.conventional", null],
      ["offerDesk.financingOptions.fha", null],
      ["offerDesk.financingOptions.va", null],
      ["offerDesk.heatOptions.hot", null],
      ["offerDesk.heatOptions.balanced", null],
      ["offerDesk.heatOptions.cool", null],
      ["cma.conditions.below", null],
      ["cma.conditions.average", null],
      ["cma.conditions.above", null],
    ];
    const missing: string[] = [];
    for (const locale of LOCALE_NAMES) {
      const b = bundle(locale);
      for (const [key] of expected) {
        if (typeof at(b, key) !== "string") missing.push(`${locale}: ${key}`);
      }
    }
    expect(missing, `\n${missing.join("\n")}\n`).toEqual([]);
    // The casing is the point: these must not be re-derived from the slug.
    const en = bundle("en");
    expect(at(en, "offerDesk.financingOptions.fha")).toBe("FHA");
    expect(at(en, "offerDesk.financingOptions.va")).toBe("VA");
  });

  /**
   * Scoped to `pillText` on purpose. Two other styles in that file capitalize
   * AI-written prose (an offer strategy, a contingency note), where it is
   * harmless. The bug was capitalizing a FIXED SLUG: the financing and
   * market-heat chips rendered `{f}` and `{h}` straight from
   * ["cash","conventional","fha","va"], so CSS produced "Fha" and "Va".
   */
  it("does not title-case the option chips with CSS", () => {
    const src = readFileSync(join(MOBILE, "app", "(tabs)", "offer-desk.tsx"), "utf8");
    const pillText = src.match(/pillText:\s*\{[^}]*\}/);
    expect(pillText, "pillText style not found").toBeTruthy();
    expect(pillText![0], "capitalize on pillText turns fha into Fha").not.toMatch(
      /textTransform/,
    );
    // And the chips must go through t(), not render the slug directly.
    expect(src).toMatch(/offerDesk\.financingOptions\.\$\{f\}/);
    expect(src).toMatch(/offerDesk\.heatOptions\.\$\{h\}/);
  });

  /**
   * The Deals group — Listings · Showings · Offers · Transactions — landed on
   * mobile with three status/type domains, every one of them a database enum
   * read straight into a key. Exactly the shape that printed
   * `platforms.threads`, so the unions are parsed out of the SERVER types
   * they come from: adding a status to `lib/offers/types.ts` without
   * translating it fails here rather than on a phone.
   *
   * Listings are included because `listListingsForAgent` maps the listings
   * table's own six states down to TransactionStatus for the badge UI, so the
   * app sees the same four values.
   */
  it("translates every deal status and transaction type", () => {
    const union = (file: string[], name: string): string[] => {
      const src = readFileSync(join(WEB_LIB, ...file), "utf8");
      const block = src.match(new RegExp(`export type ${name} =([^;]*);`));
      expect(block, `${name} union not found in ${file.join("/")}`).toBeTruthy();
      const values = [...block![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
      expect(values.length, `${name} parsed as empty`).toBeGreaterThan(1);
      return values;
    };

    const domains: Array<[string, string[]]> = [
      ["transactions.status", union(["transactions", "types.ts"], "TransactionStatus")],
      ["transactions.types", union(["transactions", "types.ts"], "TransactionType")],
      ["listings.status", union(["transactions", "types.ts"], "TransactionStatus")],
      ["offers.status", union(["offers", "types.ts"], "OfferStatus")],
    ];

    const missing: string[] = [];
    for (const locale of LOCALE_NAMES) {
      const b = bundle(locale);
      for (const [prefix, values] of domains) {
        for (const v of values) {
          if (typeof at(b, `${prefix}.${v}`) !== "string") {
            missing.push(`${locale}: ${prefix}.${v}`);
          }
        }
      }
    }
    expect(missing, `\n${missing.join("\n")}\n`).toEqual([]);
  });

  /**
   * And the screens must route those values through `t()` with a defaultValue,
   * so a value the bundle has not caught up with renders as nothing rather
   * than as its own slug — the same contract `platformLabel` keeps.
   */
  it("keeps a no-slug fallback on the three deal screens", () => {
    const screens: Array<[string[], string]> = [
      [["app", "transactions", "index.tsx"], "transactions.status"],
      [["app", "listings", "index.tsx"], "listings.status"],
      [["app", "offers", "index.tsx"], "offers.status"],
    ];
    for (const [file, prefix] of screens) {
      const src = readFileSync(join(MOBILE, ...file), "utf8");
      // Single-quoted on purpose: the needle contains both a ${...} and a
      // backtick, and neither is ours to interpolate.
      expect(src, `${file.join("/")} must resolve ${prefix} through t()`).toContain(
        prefix + '.${row.status}`, { defaultValue: "" }',
      );
    }
  });

  it("resolves the two values from the bug report", () => {
    for (const locale of LOCALE_NAMES) {
      const b = bundle(locale);
      expect(at(b, "platforms.threads"), `${locale} platforms.threads`).toBe("Threads");
      expect(typeof at(b, "post_history.triggers.marketing_assistant_social")).toBe("string");
    }
  });
});
