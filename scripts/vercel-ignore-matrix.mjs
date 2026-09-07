#!/usr/bin/env node
// Validation matrix for scripts/vercel-ignore.mjs.
//
// A build-skip step that gets it wrong leaves production on stale code behind a
// green tick — the one failure mode worse than the red crosses it exists to
// remove. So before this shipped, it was run against real commits from this
// repo's history, with the expected answer written down FIRST from the
// dependency graph rather than read off whatever Turbo happened to say.
//
// It drives the real script — same arguments, same code path — with --base and
// --head standing in for the Vercel environment.
//
// Run:  node scripts/vercel-ignore-matrix.mjs
//
// Needs full git history for the commits below, so it is a local/manual check,
// not a CI one: GitHub Actions clones at depth 1 and none of these commits
// would be reachable. The unit tests that DO run in CI cover the script's
// decision and fail-open behaviour; this covers the graph.
//
// Note on what is being asserted: Turbo reads TODAY'S package.json files while
// diffing a historical commit range. That is the right question — "with the
// dependency graph as it stands, would this config have skipped that commit?" —
// but it means an answer can legitimately change when dependencies do.

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APPS = {
  propertytoolsai: "apps/propertytoolsai",
  leadsmartai: "apps/leadsmartai",
  helmsmart: "apps/helmsmart-web",
};

/**
 * Each case: a real commit, and what each project SHOULD do about it.
 *
 * The reasoning is the point. "build" must name the edge that carries the
 * change; "skip" must be an absence of one.
 */
const CASES = [
  {
    commit: "69ed69a5",
    what: "apps/leadsmartai + packages/i18n",
    expect: { propertytoolsai: "skip", leadsmartai: "build", helmsmart: "skip" },
    why:
      "leadsmartai owns the changed files. propertytoolsai and helmsmart both " +
      "have no dependency on @repo/i18n — neither package.json lists it and " +
      "neither imports it — so a locale change cannot reach either of them.",
  },
  {
    commit: "00a6c665",
    what: "apps/leadsmartai + apps/propertytoolsai + packages/shared",
    expect: { propertytoolsai: "build", leadsmartai: "build", helmsmart: "skip" },
    why:
      "propertytoolsai's own files changed, so it must build even before the " +
      "@leadsmart/shared edge is considered. helmsmart does not depend on that " +
      "package.",
  },
  {
    commit: "5edd8da7",
    what: "apps/helmsmart-web only",
    expect: { propertytoolsai: "skip", leadsmartai: "skip", helmsmart: "build" },
    why: "The clean case, in the other direction: nothing outside helmsmart moved.",
  },
  {
    commit: "8c836d04",
    what: "packages/ui + apps/leadsmartai + packages/i18n",
    expect: { propertytoolsai: "build", leadsmartai: "build", helmsmart: "skip" },
    why:
      "propertytoolsai depends on @repo/ui, so a shared-package change OUTSIDE " +
      "its root directory must still build it. This is the case Vercel's own " +
      "root-directory skip gets wrong, and the reason these projects had no " +
      "skip step at all.",
  },
  {
    commit: "9ebba877",
    what: "packages/valuation + apps/leadsmartai + packages/i18n",
    expect: { propertytoolsai: "build", leadsmartai: "build", helmsmart: "skip" },
    why: "Same edge, a different shared package: propertytoolsai depends on @repo/valuation.",
  },
  {
    commit: "b3369559",
    what: "docs/ENTITLEMENT_GAP.md only",
    expect: { propertytoolsai: "skip", leadsmartai: "skip", helmsmart: "skip" },
    why: "A markdown file no app builds from. Nothing should deploy for it.",
  },
  {
    commit: "b779193b",
    what: "pnpm-lock.yaml + packages/shared + packages/valuation + three apps",
    expect: { propertytoolsai: "build", leadsmartai: "build", helmsmart: "skip" },
    why:
      "A lockfile change is not automatically global: Turbo resolves which " +
      "packages' external dependencies actually moved. helmsmart's did not, and " +
      "none of its own files changed.",
  },
  {
    commit: "35fb6054",
    what: "turbo.json + apps/leadsmartai + apps/propertytoolsai",
    expect: { propertytoolsai: "build", leadsmartai: "build", helmsmart: "build" },
    why:
      "THE DANGEROUS CASE. turbo.json is the env allowlist — a variable added " +
      "there reaches an app only on its next build. If a turbo.json change could " +
      "be skipped, the fix for a stripped env var would never deploy. Turbo " +
      "treats it as a global input, so every project builds.",
  },
];

function sha(rev) {
  return execFileSync("git", ["rev-parse", rev], { cwd: ROOT, encoding: "utf8" }).trim();
}

function ask(app, base, head) {
  const r = execFileSync(
    process.execPath,
    [join(ROOT, "scripts", "vercel-ignore.mjs"), `--base=${base}`, `--head=${head}`],
    { cwd: join(ROOT, APPS[app]), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return r.trim().startsWith("SKIP") ? "skip" : "build";
}

let failed = 0;
const width = 16;
console.log(
  `${"commit".padEnd(10)}${"touched".padEnd(58)}` +
    Object.keys(APPS)
      .map((a) => a.padEnd(width))
      .join(""),
);

for (const c of CASES) {
  const head = sha(c.commit);
  const base = sha(`${c.commit}^`);
  const cells = [];
  for (const app of Object.keys(APPS)) {
    let got;
    try {
      got = ask(app, base, head);
    } catch (e) {
      // The script exits 1 for "build" — execFileSync throws on that, so a
      // non-zero exit is an answer, not an error. Anything else is a failure.
      const out = String(e?.stdout ?? "");
      got = out.trim().startsWith("SKIP") ? "skip" : out.trim().startsWith("BUILD") ? "build" : "ERROR";
    }
    const want = c.expect[app];
    if (got !== want) failed++;
    cells.push(`${got === want ? " " : "!"}${got}${got === want ? "" : ` (want ${want})`}`.padEnd(width));
  }
  console.log(`${c.commit.padEnd(10)}${c.what.slice(0, 56).padEnd(58)}${cells.join("")}`);
}

console.log("");
if (failed) {
  console.error(`${failed} mismatch(es) — do NOT ship the ignore step until these agree.`);
  process.exit(1);
}
console.log(`${CASES.length} cases, ${CASES.length * Object.keys(APPS).length} answers, all as expected.`);
