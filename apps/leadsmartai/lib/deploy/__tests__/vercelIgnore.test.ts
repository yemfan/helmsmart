import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A plain .mjs build script, deliberately dependency-free.
import { BUILD, SKIP, decide } from "../../../../../scripts/vercel-ignore.mjs";

/**
 * The build-skip step, guarded from the side that can hurt.
 *
 * Every Vercel project in this repo used to rebuild on every commit to main.
 * propertytoolsai ran a full production build for fourteen leadsmartai commits
 * on 2026-09-06, and because Vercel kills an in-flight production build when a
 * newer commit lands — reported to GitHub as a red cross — seven of them came
 * back CANCELED and were read as broken builds.
 *
 * The cure has a worse failure mode than the disease: a step that wrongly skips
 * leaves production on stale code behind a GREEN tick, which nobody goes
 * looking for. So the contract under test is not "does it skip" but "does every
 * uncertain path build".
 *
 * The dependency-graph half of this lives in scripts/vercel-ignore-matrix.mjs,
 * which drives the same script over eight real commits. It cannot run here:
 * Actions clones at depth 1 and none of those commits would be reachable.
 */
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const SCRIPT = join(ROOT, "scripts", "vercel-ignore.mjs");

/** Runs the script the way Vercel does, and reports its exit code and line. */
function runScript(args: string[], env: Record<string, string> = {}, cwd = ROOT) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, VERCEL_GIT_PREVIOUS_SHA: "", VERCEL_GIT_COMMIT_SHA: "", ...env },
    });
    return { code: 0, out: stdout.trim() };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? -1, out: String(err.stdout ?? "").trim() };
  }
}

describe("decide: reading Turbo's answer", () => {
  it("skips only on an explicit, empty task list", () => {
    expect(decide('{"tasks":[]}')).toBe(SKIP);
    expect(decide('• turbo 2.8.20\n{"tasks":[]}')).toBe(SKIP); // banner and all
  });

  it("builds when anything is affected", () => {
    expect(decide('{"tasks":[{"taskId":"propertytoolsai#build"}]}')).toBe(BUILD);
  });

  it("builds on every shape that is not an answer", () => {
    /*
     * The whole risk lives here. An empty string, a crash message, half a
     * document, or JSON without a tasks array must never be mistaken for
     * "nothing to do" — that is how a deploy goes missing behind a green tick.
     */
    for (const junk of ["", "   ", "turbo: command not found", "{", '{"tasks"', "{}", '{"tasks":null}', "null"]) {
      expect(decide(junk), `should build on ${JSON.stringify(junk)}`).toBe(BUILD);
    }
  });
});

describe("the script's fail-open paths", () => {
  it("builds when there is no previous deployment to compare against", () => {
    // A project's first deployment on a branch has no VERCEL_GIT_PREVIOUS_SHA.
    const r = runScript(["propertytoolsai"]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^BUILD:/);
    expect(r.out).toContain("no previous deployment");
  });

  it(
    "builds when the base commit is not in the clone",
    () => {
      /*
       * On a full clone this returns at once. On a SHALLOW one — which is what
       * Vercel and Actions both give you — it exercises the real deepen loop
       * against the network, so the generous budget here is the price of
       * covering the path that actually runs in production. Each git call is
       * capped at ten seconds inside the script.
       */
      const r = runScript(["propertytoolsai", "--base=0000000000000000000000000000000000000000"]);
      expect(r.code).toBe(1);
      expect(r.out).toContain("not in this clone");
    },
    120_000,
  );

  it("builds when VERCEL_FORCE_BUILD is set, whatever the graph says", () => {
    const r = runScript(["propertytoolsai", "--base=HEAD", "--head=HEAD"], { VERCEL_FORCE_BUILD: "1" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("VERCEL_FORCE_BUILD");
  });

  it("builds when it cannot tell which package it is", () => {
    // No argument, and a working directory with no package.json.
    const r = runScript([], {}, join(ROOT, ".github"));
    expect(r.code).toBe(1);
  });

  it("uses 1 for build and 0 for skip — Vercel's inverted convention", () => {
    // Stated in the script's header; asserted here because getting it backwards
    // would skip every deployment in the repo and look like success.
    expect(BUILD).toBe(1);
    expect(SKIP).toBe(0);
  });
});

describe("wiring", () => {
  /**
   * Which vercel.json a project reads depends on its Root Directory, and the
   * three are NOT alike: helmsmart builds from the repo root (the root
   * vercel.json's cron, /api/cron/voice/reminders, exists only in
   * apps/helmsmart-web, and its "npm run build" is the root build script),
   * while the other two build from their own app directory. Putting
   * helmsmart's ignoreCommand in apps/helmsmart-web/vercel.json would be dead
   * config that silently does nothing.
   */
  const WIRED: Array<[configPath: string, pkg: string, appDir: string]> = [
    ["vercel.json", "helmsmart", "apps/helmsmart-web"],
    ["apps/propertytoolsai/vercel.json", "propertytoolsai", "apps/propertytoolsai"],
    ["apps/leadsmartai/vercel.json", "leadsmartai", "apps/leadsmartai"],
  ];

  it.each(WIRED)("%s runs the ignore step for %s", (configPath, pkg, appDir) => {
    const cfg = JSON.parse(readFileSync(join(ROOT, configPath), "utf8"));
    expect(cfg.ignoreCommand, `${configPath} has no ignoreCommand`).toBeTruthy();
    expect(cfg.ignoreCommand).toContain("scripts/vercel-ignore.mjs");
    expect(cfg.ignoreCommand.trim().endsWith(` ${pkg}`), `should name ${pkg}`).toBe(true);
    // The name has to be the one Turbo knows, not the directory name.
    const real = JSON.parse(readFileSync(join(ROOT, appDir, "package.json"), "utf8")).name;
    expect(real).toBe(pkg);
  });

  it("locates the script from the repo root, not a fixed number of '..'", () => {
    // The three Root Directories differ, so a relative hop would be wrong for
    // at least one of them — and wrong quietly, since a missing module exits
    // non-zero and Vercel reads that as "build".
    for (const [configPath] of WIRED) {
      const cfg = JSON.parse(readFileSync(join(ROOT, configPath), "utf8"));
      expect(cfg.ignoreCommand, configPath).toContain("git rev-parse --show-toplevel");
    }
  });

  it("leaves the projects that already skip alone", () => {
    // marketingboss, aibusinessworks and maxyinvestment report "Skipped - Not
    // affected" already; they have no shared-package dependencies reaching
    // outside their root directory, so Vercel's own check is enough.
    for (const rel of ["apps/marketingboss/vercel.json", "apps/aibusinessworks/vercel.json"]) {
      const cfg = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
      expect(cfg.ignoreCommand, `${rel} should not have been touched`).toBeUndefined();
    }
  });
});
