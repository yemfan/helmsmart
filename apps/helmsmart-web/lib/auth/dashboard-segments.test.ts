/**
 * `DASHBOARD_SEGMENTS` and the route tree it guards say the same thing.
 *
 * The bug this keeps fixed: `/client-assistant`, `/forms`, `/google`,
 * `/insights` and `/workflows` all shipped as `app/(dashboard)/…` routes and
 * none of them was ever added to the list in `proxy.ts`. Nothing complained.
 * A signed-out visitor asking for one of them was not redirected to `/login`
 * — the request fell straight through to the page, which rendered the
 * dashboard chrome and then went looking for an org that was not there.
 * `/approvals` had gone the other way: the page was deleted in #574 and the
 * segment stayed behind, guarding nothing.
 *
 * Both directions are the same mistake, and it is a mistake nobody makes on
 * purpose — adding a page is simply not a moment anyone is thinking about
 * middleware. So the two are checked against each other here instead of being
 * remembered.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DASHBOARD_SEGMENTS } from "./dashboard-segments";

const ROOT = path.resolve(__dirname, "..", "..");
const DASHBOARD_DIR = path.join(ROOT, "app", "(dashboard)");

const isRouteGroup = (name: string) => name.startsWith("(") && name.endsWith(")");
const isDynamic    = (name: string) => name.startsWith("[");
/** Next ignores `_private` folders, and `@slot` is a parallel route, not a path. */
const isNonRoute   = (name: string) => name.startsWith("_") || name.startsWith("@");

/** Does anything under here actually answer a request? */
function hasRoute(dir: string): boolean {
  return fs.readdirSync(dir, { withFileTypes: true }).some((e) =>
    e.isDirectory()
      ? hasRoute(path.join(dir, e.name))
      : e.name === "page.tsx" || e.name === "page.ts" || e.name === "route.ts"
  );
}

/**
 * The first URL segment of every route in the group.
 *
 * Route groups are parentheses in the filesystem and nothing in the URL, so a
 * `(dashboard)/(billing)/invoices` route is still `/invoices` — recurse
 * through them rather than reading `(billing)` as a segment.
 */
function topLevelSegments(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || isNonRoute(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (isRouteGroup(entry.name)) out.push(...topLevelSegments(full));
    else if (hasRoute(full)) out.push(entry.name);
  }
  return out;
}

const segmentsOnDisk = topLevelSegments(DASHBOARD_DIR).sort();
const guarded = [...DASHBOARD_SEGMENTS].map((s) => s.replace(/^\//, "")).sort();

describe("the dashboard auth guard", () => {
  it("finds the route tree it is describing", () => {
    // A rename of app/(dashboard) would otherwise make every assertion below
    // pass over an empty list.
    expect(fs.existsSync(DASHBOARD_DIR)).toBe(true);
    expect(segmentsOnDisk.length).toBeGreaterThan(15);
  });

  it("guards every route under app/(dashboard)", () => {
    const unguarded = segmentsOnDisk.filter((s) => !guarded.includes(s));
    expect(
      unguarded,
      `app/(dashboard)/${unguarded.join(", ")} has no entry in DASHBOARD_SEGMENTS, so a ` +
        "signed-out visitor reaches the page instead of /login. Add " +
        unguarded.map((s) => `"/${s}"`).join(", ") +
        " to lib/auth/dashboard-segments.ts."
    ).toEqual([]);
  });

  it("lists no segment that has stopped existing", () => {
    const orphans = guarded.filter((s) => !segmentsOnDisk.includes(s));
    expect(
      orphans,
      `DASHBOARD_SEGMENTS still lists ${orphans.map((s) => `"/${s}"`).join(", ")}, but ` +
        "there is no matching app/(dashboard) route. A dead segment guards nothing " +
        "and quietly reserves the prefix against any future public page under it."
    ).toEqual([]);
  });

  it("has no top-level dynamic segment, which a prefix cannot express", () => {
    // `startsWith("/[org]")` matches the literal text, not a slug. If the
    // dashboard ever grows `app/(dashboard)/[workspace]/…`, the guard has to
    // change shape, not gain another string.
    const dynamic = fs
      .readdirSync(DASHBOARD_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && isDynamic(e.name))
      .map((e) => e.name);
    expect(dynamic).toEqual([]);
  });

  it("is the list proxy.ts actually uses", () => {
    // The check above is worth nothing if proxy.ts goes back to a literal of
    // its own — the two would drift apart again with the test still green.
    const proxy = fs.readFileSync(path.join(ROOT, "proxy.ts"), "utf8");
    expect(proxy).toMatch(
      /import\s*\{\s*DASHBOARD_SEGMENTS\s*\}\s*from\s*"@\/lib\/auth\/dashboard-segments"/
    );
    expect(proxy).not.toMatch(/(?:const|let|var)\s+DASHBOARD_SEGMENTS/);
    expect(proxy).toContain("DASHBOARD_SEGMENTS.some((seg) => pathname.startsWith(seg))");
  });
});
