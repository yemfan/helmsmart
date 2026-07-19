#!/usr/bin/env node
// Turbo env-allowlist guard (zero-dependency).
//
// THE FAILURE THIS PREVENTS: Turbo 2 runs tasks in a sanitised environment.
// A variable set in the Vercel dashboard but missing from turbo.json is
// silently stripped — `process.env.FOO` is undefined at runtime, there is NO
// error, and the feature simply behaves as though it was never configured.
//
// That cost real time and money before this guard existed: seven variables were
// dead in production for weeks (PR #897), including TWILIO_MESSAGING_SERVICE_SID
// — which had been recorded as THE fix for an SMS carrier error, and never
// actually reached the app — and CRON_SECRET, which every cron authorises
// against. Turbo warned on every single build; the warning scrolled past.
//
// Vercel's own warning can only be seen in its build logs, and needs Vercel's
// project env list. This checks the same law from the other side, using only
// the repo: every env var the CODE reads must be declared in turbo.json. If a
// var is worth reading it is worth declaring, and a declared-but-unset var is
// harmless.
//
// Wire-up: `pnpm env:check`, and .github/workflows/env-allowlist.yml on every PR.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOTS = ['apps', 'packages', 'industry-packs'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'build', 'coverage', '.git']);

/**
 * Provided by the platform or the toolchain, never by us — declaring these
 * would be noise, and some (VERCEL_*) are injected after Turbo runs anyway.
 */
const SYSTEM = [
  /^NODE_ENV$/, /^CI$/, /^PORT$/, /^TZ$/,
  /^VERCEL/, /^NEXT_RUNTIME$/, /^NEXT_PHASE$/, /^NEXT_TELEMETRY/,
  /^TURBO_/, /^npm_/, /^ANALYZE$/, /^DEBUG$/,
  /^AWS_/, /^LAMBDA_/, /^__NEXT/,
  // Consumed by the build wrapper (scripts/next-build.mjs) and Playwright, which
  // run OUTSIDE the turbo task env — declaring them in turbo.json would imply a
  // relationship that doesn't exist.
  /^NODE_OPTIONS$/, /^NEXT_BUILD_/, /^NEXT_DIST_IN_MONOREPO_ROOT$/,
  /^NEXT_BUILD_OUTPUT_AT_MONOREPO_ROOT$/, /^E2E_BASE_URL$/,
];

const isSystem = (name) => SYSTEM.some((re) => re.test(name));

function listFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) out.push(...listFiles(p));
    else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry)) out.push(p);
  }
  return out;
}

// `process.env.FOO`, `process.env["FOO"]`, `process.env['FOO']`
const ENV_RE = /process\.env\s*(?:\.\s*([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\])/g;

/** Declared names + wildcard prefixes from every task's `env` and `globalEnv`. */
function declaredPatterns() {
  const turbo = JSON.parse(readFileSync(join(ROOT, 'turbo.json'), 'utf8'));
  const patterns = new Set(turbo.globalEnv ?? []);
  for (const task of Object.values(turbo.tasks ?? {})) {
    for (const e of task.env ?? []) patterns.add(e);
  }
  return [...patterns];
}

function isDeclared(name, patterns) {
  return patterns.some((p) =>
    p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : p === name,
  );
}

const patterns = declaredPatterns();
const missing = new Map(); // name -> Set(files)

for (const base of SCAN_ROOTS) {
  for (const file of listFiles(join(ROOT, base))) {
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }
    if (!src.includes('process.env')) continue;
    for (let m = ENV_RE.exec(src); m; m = ENV_RE.exec(src)) {
      const name = m[1] || m[2];
      if (!name || isSystem(name) || isDeclared(name, patterns)) continue;
      if (!missing.has(name)) missing.set(name, new Set());
      missing.get(name).add(relative(ROOT, file).replace(/\\/g, '/'));
    }
  }
}

if (missing.size > 0) {
  console.error(`\n✗ ${missing.size} environment variable(s) are read by the code but NOT declared in turbo.json:\n`);
  for (const [name, files] of [...missing].sort()) {
    console.error(`  ${name}`);
    for (const f of [...files].slice(0, 3)) console.error(`      ${f}`);
    if (files.size > 3) console.error(`      … and ${files.size - 3} more`);
  }
  console.error(`
Turbo 2 strips anything not declared, so these are undefined at runtime with NO
error — the feature just behaves as if it was never configured.

Fix: add each to "env" in turbo.json (a wildcard like "FOO_*" covers a family).
If it is genuinely platform-provided, add it to SYSTEM in scripts/check-env-allowlist.mjs.
`);
  process.exit(1);
}

console.log(`✓ env allowlist clean — every process.env read is declared in turbo.json (${patterns.length} patterns)`);
