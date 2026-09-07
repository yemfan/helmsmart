#!/usr/bin/env node
// Vercel "Ignored Build Step" for this monorepo (zero-dependency).
//
// THE FAILURE THIS PREVENTS: every Vercel project here rebuilds on every commit
// to main, whether or not anything it depends on changed. propertytoolsai does
// not consume packages/i18n and has nothing to do with apps/leadsmartai, yet it
// ran a full ~8-minute production build for all fourteen of 2026-09-06's
// leadsmartai commits.
//
// That is not only wasted minutes. Vercel cancels a production build when a
// newer commit lands on the same branch, and GitHub renders CANCELED as a red
// cross on the commit. Seven of that day's propertytoolsai deployments came
// back `"readyState": "CANCELED"` — two of them killed in the same millisecond
// — and every one of them was read as a broken build. Nothing was broken. Merge
// two PRs inside one build window and you manufacture a failure.
//
// So: ask Turborepo whether this package's dependency graph actually changed
// between the last deployment and this commit, and skip the build if it did not.
//
// EXIT CODES ARE VERCEL'S, AND THEY ARE INVERTED: 1 means build, 0 means skip.
//
// EVERY uncertain path exits 1. A wrongly-skipped deploy leaves production on
// stale code behind a green tick, which is far worse than the eight minutes a
// wrongly-run build costs — so a missing SHA, an unreachable base commit, a
// Turbo crash and unparseable output all build.
//
// Usage:  node ../../scripts/vercel-ignore.mjs <package-name>
//         (from an app's Root Directory, via "ignoreCommand" in vercel.json)
//
// Validation: --base=<sha> --head=<sha> replaces the Vercel environment, so
//             `pnpm deploy:ignore-matrix` (scripts/vercel-ignore-matrix.mjs)
//             drives this exact code path over eight real commits rather than
//             an approximation of it. The decision and fail-open behaviour are
//             unit-tested in apps/leadsmartai/lib/deploy/__tests__.

import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const BUILD = 1;
export const SKIP = 0;

/**
 * Turbo prints a banner before its JSON. Everything from the first brace on is
 * the document; anything else — a crash, an empty string, a usage error — is
 * not a "no tasks" answer and must never be read as one.
 */
export function decide(stdout) {
  const start = stdout.indexOf("{");
  if (start === -1) return BUILD;
  let parsed;
  try {
    parsed = JSON.parse(stdout.slice(start));
  } catch {
    return BUILD;
  }
  if (!Array.isArray(parsed.tasks)) return BUILD;
  return parsed.tasks.length === 0 ? SKIP : BUILD;
}

function arg(name) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function packageName() {
  const explicit = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (explicit) return explicit;
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).name;
  } catch {
    return null;
  }
}

/** The turbo the repo pins, fetched on demand: this runs before the install. */
function turboSpec() {
  try {
    const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const v = root.devDependencies?.turbo ?? root.dependencies?.turbo;
    return v ? `turbo@${v}` : "turbo";
  } catch {
    return "turbo";
  }
}

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    // Bounded: this sits on the critical path of every deployment, and a fetch
    // that hangs would stall the build it is meant to save.
    timeout: 10_000,
  });
}

function haveCommit(sha) {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Vercel clones shallowly, so the previous deployment's commit is often absent.
 * Deepen until it appears — and if it will not appear, build.
 *
 * Only worth attempting on a shallow clone: in a complete one a commit that is
 * missing is missing for good, and three network round trips would buy nothing
 * but latency on the critical path of every deployment.
 */
function reach(sha) {
  if (haveCommit(sha)) return true;
  let shallow = false;
  try {
    shallow = git(["rev-parse", "--is-shallow-repository"]).trim() === "true";
  } catch {
    shallow = false;
  }
  if (!shallow) return false;
  for (const depth of ["20", "100", "500"]) {
    try {
      git(["fetch", `--depth=${depth}`, "origin", sha]);
    } catch {
      try {
        git(["fetch", `--deepen=${depth}`, "origin"]);
      } catch {
        // Keep trying, then give up into a build.
      }
    }
    if (haveCommit(sha)) return true;
  }
  return false;
}

function say(code, why) {
  console.log(`${code === SKIP ? "SKIP" : "BUILD"}: ${why}`);
  return code;
}

export function run() {
  const pkg = packageName();
  if (!pkg) return say(BUILD, "could not work out which package this is");

  // The escape hatch, for when someone needs a deploy the graph says is
  // unnecessary — a corrupted build cache, an env var change, a rollback.
  if (process.env.VERCEL_FORCE_BUILD) return say(BUILD, `${pkg}: VERCEL_FORCE_BUILD is set`);

  const base = arg("base") ?? process.env.VERCEL_GIT_PREVIOUS_SHA;
  const head = arg("head") ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "HEAD";

  // No previous deployment on this branch: there is nothing to compare against.
  if (!base) return say(BUILD, `${pkg}: no previous deployment to compare against`);
  if (!reach(base)) return say(BUILD, `${pkg}: ${base.slice(0, 8)} is not in this clone`);

  const filter = `${pkg}...[${base}...${head}]`;
  let stdout;
  try {
    // Vercel runs this on Linux, before the install, so turbo is fetched by
    // npx. Windows needs a shell to reach npx at all (Node refuses to spawn a
    // .cmd directly since 20.x) — that path exists only for local validation.
    const win = process.platform === "win32";
    const opts = { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 };
    stdout = win
      ? execSync(`npx --yes ${turboSpec()} run build --filter="${filter}" --dry=json`, { ...opts, shell: true })
      : execFileSync("npx", ["--yes", turboSpec(), "run", "build", `--filter=${filter}`, "--dry=json"], opts);
  } catch (e) {
    const first = String(e?.message ?? "unknown").split("\n")[0];
    return say(BUILD, `${pkg}: turbo could not answer (${first})`);
  }

  const code = decide(stdout);
  return say(
    code,
    code === SKIP
      ? `${pkg}: nothing it depends on changed since ${base.slice(0, 8)}`
      : `${pkg}: affected by changes since ${base.slice(0, 8)}`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("vercel-ignore.mjs")) {
  process.exit(run());
}
