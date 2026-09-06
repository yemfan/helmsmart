import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Importing the tool module pulls in the admin client, which builds itself
// from env vars this test has no reason to need.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

/**
 * The bug this tool exists to prevent is a CONFIDENT WRONG LOCATION.
 *
 * A realtor asked Max what their timezone was set to. Max had no tool that
 * could see it, handed the question off, and told them to open
 * "Settings → Account / Profile → Timezone" — a path it invented. It sounded
 * right, which is exactly why nobody would have caught it.
 *
 * So the test that matters is not that the tool returns a string. It is that
 * the location it hands out is a page this app actually serves, checked
 * against the filesystem rather than against a copy of the answer. Settings
 * were reorganised into groups days after the timezone control shipped and the
 * pointer text in the briefing card was left naming a group that no longer
 * exists; a hand-kept expectation here would have been updated in the same
 * sweep that missed it.
 */

const APP = join(__dirname, "..", "..", "..", "..", "app");
const SRC = join(__dirname, "..", "impl", "accountSettings.ts");

function hrefInSource(): string {
  const src = readFileSync(SRC, "utf8");
  const m = src.match(/ACCOUNT_SETTINGS_HREF\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("ACCOUNT_SETTINGS_HREF is gone — this check cannot reach its subject.");
  return m[1];
}

describe("get_account_settings points somewhere real", () => {
  it("hands out a route this app serves", () => {
    const href = hrefInSource();
    expect(href.startsWith("/")).toBe(true);
    const page = join(APP, ...href.split("/").filter(Boolean), "page.tsx");
    expect(existsSync(page), `${href} has no page at ${page}`).toBe(true);
  });

  it("points at the page that actually renders the timezone control", () => {
    // Naming the right URL is not enough if the control moved off it — the
    // realtor still lands somewhere that does not answer their question.
    const href = hrefInSource();
    const page = readFileSync(join(APP, ...href.split("/").filter(Boolean), "page.tsx"), "utf8");
    expect(page).toContain("AccountTimezonePanel");
  });

  it("reads only columns that agents actually has", async () => {
    // A select naming a column that does not exist fails the WHOLE query with
    // 42703 — the timezone would go down with it. `locale` was in the first
    // draft of this tool and there is no such column.
    const src = readFileSync(SRC, "utf8");
    const select = src.match(/\.select\("([^"]+)"\)/);
    expect(select, "no .select() found").toBeTruthy();
    const columns = select![1].split(",").map((c) => c.trim());
    expect(columns).toEqual(["timezone", "briefing_morning_time", "briefing_evening_time"]);
  });
});

describe("it names the place, not the path", () => {
  it("returns a human label alongside the href", () => {
    // Handing back only a route made Max write "go to
    // /dashboard/settings/account" to the realtor — a bare internal path, which
    // the system prompt forbids two rules above the one this tool was built to
    // enforce. Seen in production before this line existed.
    const src = readFileSync(SRC, "utf8");
    expect(src).toMatch(/ACCOUNT_SETTINGS_LABELS/);
    expect(src).toContain("whereToChangeLink");
  });
});

describe("it says it in the realtor's language", () => {
  it("uses the words on the realtor's own screen", async () => {
    // Asked in Chinese, Max answered in Chinese and then quoted the English
    // "Settings → Account" while the sidebar beside it read 设置 / 账户 — the
    // label was one hard-coded string. Seen in production.
    const { accountSettingsLabel } = await import("../impl/accountSettings");
    expect(accountSettingsLabel("zh-Hans")).toBe("设置 → 账户");
    expect(accountSettingsLabel("zh-hans")).toBe("设置 → 账户");
    expect(accountSettingsLabel("en")).toBe("Settings → Account");
  });

  it("falls back to English rather than to nothing", () => {
    // A run started by the overnight cron can have a null locale.
    return import("../impl/accountSettings").then(({ accountSettingsLabel }) => {
      expect(accountSettingsLabel(null)).toBe("Settings → Account");
      expect(accountSettingsLabel(undefined)).toBe("Settings → Account");
      expect(accountSettingsLabel("de")).toBe("Settings → Account");
    });
  });
});
