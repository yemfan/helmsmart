import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Where a "create account" button sends a real-estate professional.
 *
 * There are two signup forms and they are not interchangeable:
 *
 *   /agent-signup  writes leadsmart_users.role = "agent", captures brokerage
 *                  and licence, creates the `agents` row, lands on /dashboard.
 *   /signup        the HOMEOWNER form. Hard-codes role "user" (which billing
 *                  reads as "consumer"), creates no `agents` row, and ends on
 *                  router.push("/") — the marketing homepage.
 *
 * The landing page's primary CTA pointed at /onboarding, whose "Create
 * account" button pointed at /signup. So an agent clicking the biggest button
 * on the site went through the homeowner funnel and was returned to the
 * marketing page, logged in, with no agent account and no way to the
 * dashboard. Seven consecutive signups landed that way; three of them never
 * got an `agents` row at all and never reached the product.
 *
 * Nothing failed loudly, which is why it survived several rounds of "fix the
 * signup" — the dashboard guard and the auto-provision were both working. The
 * href was the bug, and an href does not throw.
 */

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];

/**
 * Files where linking to the homeowner form is correct.
 *
 * Both are deliberate and neither is a funnel entry point: one IS the
 * homeowner funnel, the other is the "not an agent?" escape hatch offered
 * inside the agent form itself.
 */
const ALLOWED = new Map<string, string>([
  ["app/home-value-funnel/page.tsx", "The homeowner funnel — /signup is the correct form here."],
  [
    "components/agent-signup/AgentSignupForm.tsx",
    "The 'not an agent? sign up here' cross-link out of the agent form.",
  ],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("signup funnel", () => {
  it("routes professionals to the agent form, not the homeowner one", () => {
    const offenders: string[] = [];
    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const rel = relative(ROOT, file).split(sep).join("/");
        if (ALLOWED.has(rel)) continue;
        const src = readFileSync(file, "utf8");
        // Only the exact route: /signup-something-else is a different page.
        for (const m of src.matchAll(/href=(?:"|\{")\/signup(?:"|\?)/g)) {
          const line = src.slice(0, m.index ?? 0).split("\n").length;
          offenders.push(`${rel}:${line}`);
        }
      }
    }
    expect(offenders, `\nThese link to the HOMEOWNER signup form.\n${offenders.join("\n")}\n`).toEqual([]);
  });

  it("keeps the two deliberate exceptions actually pointing there", () => {
    // If an allowlisted file stops linking to /signup, the entry is stale and
    // should be removed rather than left to silently permit a future mistake.
    for (const [rel, why] of ALLOWED) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src, `${rel} is allowlisted (${why}) but no longer links to /signup`).toContain(
        'href="/signup"',
      );
    }
  });

  it("has an agent form that assigns the agent role", () => {
    // The role is what makes them an agent to billing, pricing copy and route
    // guards. If this stops being written, professionals silently become
    // consumers again — the exact symptom, with the routing already fixed.
    const form = readFileSync(
      join(ROOT, "components", "agent-signup", "AgentSignupForm.tsx"),
      "utf8",
    );
    expect(form).toMatch(/accountType[^=]*=\s*"agent"/);
    expect(form).toContain("role: accountType");
  });
});
