import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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
