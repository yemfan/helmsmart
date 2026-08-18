#!/usr/bin/env node
// Brand rename sweep (zero-dependency).  Dry-run by default.
//
//   node scripts/rename-brand.mjs --name "CloseBoss" --domain "closebossai.com"
//   node scripts/rename-brand.mjs --name "CloseBoss" --domain "closebossai.com" --apply
//
// Scope: USER-VISIBLE brand only.  The brand name and the in-product "Boss Assistant"
// role are separable -- the mark at issue is REALTYBOSS, not BOSS -- so this sweep
// deliberately does NOT touch:
//   * `boss_*` database identifiers (that is the assistant role, not the brand)
//   * lowercase `realtyboss` in code paths (lib/realtyboss, api/dashboard/realtyboss,
//     components/realtyboss).  230 of 263 such refs are import/route paths; renaming
//     them without moving the directories breaks the build.  Use --deep for those,
//     and expect to `git mv` the directories yourself.
//   * legacy `realtorboss` spellings (historical, intentionally preserved)
//
// Rules run longest-match-first so `realtybossai.com` is consumed before `realtybossai`,
// and `RealtyBoss AI` before `RealtyBoss`.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- args -------------------------------------------------------------------

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}
const NEW_NAME = arg('--name');
const NEW_DOMAIN = arg('--domain');
const APPLY = process.argv.includes('--apply');
const DEEP = process.argv.includes('--deep');

if (!NEW_NAME || !NEW_DOMAIN) {
  console.error('usage: node scripts/rename-brand.mjs --name "CloseBoss" --domain "closebossai.com" [--apply] [--deep]');
  process.exit(2);
}
// closebossai.com -> closebossai   (the bare slug used in non-domain contexts)
const NEW_SLUG = NEW_DOMAIN.replace(/\.(com|ai|io|app)$/i, '');
const NEW_LOWER = NEW_NAME.toLowerCase();

// --- what never gets touched ------------------------------------------------

// Migrations are history: rewriting them rewrites what already ran in prod.
// LEGACY.md and the next.config compat rewrites exist precisely to record the old name.
const SKIP_PATHS = [
  /[\\/]migrations[\\/]/i,
  /REALTORBOSS_LEGACY\.md$/i,
  /realtyboss-theme-constitution\.md$/i, // renamed .docx -- binary, edit the .extracted.md
  /[\\/]next\.config\.js$/i,             // holds deliberate realtorboss->realtyboss rewrites
  // This file IS the rename tool: its RULES table holds `realtyboss` as the SOURCE
  // pattern.  Sweeping it rewrites the left-hand side, so every rule becomes a
  // no-op identity mapping and the tool can never be run again.
  /rename-brand\.mjs$/i,
  // The runbook records WHY the rename happened: `RealtyBoss` collides with USPTO
  // Reg. 6152911.  Swept, it would assert the NEW name infringes -- inverting a
  // trademark finding.  It is a historical record, like the migrations.
  /rename-runbook\.md$/i,
];

const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|html|yml|yaml|txt|sql|env|example)$/i;

// --- rules (order is load-bearing) ------------------------------------------

const RULES = [
  ['www.realtybossai.com', `www.${NEW_DOMAIN}`],
  ['app.realtybossai.com', `app.${NEW_DOMAIN}`],
  ['realtybossai.com', NEW_DOMAIN],
  ['RealtyBoss AI', `${NEW_NAME} AI`],
  ['realtybossai', NEW_SLUG],
  ['RealtyBoss', NEW_NAME],
  ...(DEEP ? [['realtyboss', NEW_LOWER]] : []),
];

// --- file list --------------------------------------------------------------

// Drive off the git index, not the filesystem: it respects .gitignore for free and
// keeps us out of node_modules, build output, and .claude/worktrees (sibling sessions'
// checkouts, which would otherwise be swept 3x over).
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

const skipped = [];
const changed = [];
const perRule = Object.fromEntries(RULES.map(([from]) => [from, 0]));
const binaries = [];
const moves = [];

for (const rel of trackedFiles()) {
  const file = join(ROOT, rel);

  if (SKIP_PATHS.some((re) => re.test(rel))) { skipped.push(rel); continue; }

  // a file whose NAME carries the brand must move in lockstep with the sweep
  const base = rel.split('/').pop();
  if (/RealtyBoss/.test(base) || (DEEP && /realtyboss/.test(base))) moves.push(rel);

  if (!TEXT_EXT.test(rel)) {
    // flag binaries that carry the brand in their filename -- they need regenerating, not sed
    if (/realtyboss/i.test(rel)) binaries.push(rel);
    continue;
  }

  const src = readFileSync(file, 'utf8');
  let out = src;
  const hits = [];
  for (const [from, to] of RULES) {
    const n = out.split(from).length - 1;
    if (n > 0) { out = out.split(from).join(to); perRule[from] += n; hits.push(`${from}×${n}`); }
  }
  if (out !== src) {
    changed.push({ rel, hits });
    if (APPLY) writeFileSync(file, out, 'utf8');
  }
}

// --- report -----------------------------------------------------------------

const total = Object.values(perRule).reduce((a, b) => a + b, 0);

console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — ${NEW_NAME} <${NEW_DOMAIN}>${DEEP ? '  [deep: paths included]' : ''}\n`);
console.log(`files changed : ${changed.length}`);
console.log(`replacements  : ${total}\n`);

for (const [from, n] of Object.entries(perRule)) {
  if (n) console.log(`  ${String(n).padStart(4)}  ${from}  →  ${RULES.find(([f]) => f === from)[1]}`);
}

// The sweep rewrites the identifier AND its import specifier (RealtyBossLogo ->
// CloseBossLogo, "@/components/brand/RealtyBossLogo" -> ".../CloseBossLogo").  That is
// only coherent if the file moves too -- otherwise the import resolves to nothing and
// the build breaks.  Emit the moves rather than leaving it as a footgun.
if (moves.length) {
  console.log(`\nREQUIRED — run these ${moves.length} move(s) with the sweep, or the build breaks:`);
  for (const m of moves) console.log(`  git mv ${m} ${m.replace(/RealtyBoss/g, NEW_NAME).replace(/realtyboss/g, NEW_LOWER)}`);
}

if (binaries.length) {
  console.log(`\nREGENERATE BY HAND (binary — art, not text) — ${binaries.length}:`);
  for (const b of binaries) console.log(`  ${b}`);
}

console.log(`\nSKIPPED ON PURPOSE — ${skipped.length} (migrations / legacy records / .docx / next.config compat):`);
for (const s of skipped.slice(0, 8)) console.log(`  ${s}`);
if (skipped.length > 8) console.log(`  ... and ${skipped.length - 8} more`);

if (!DEEP) {
  console.log(`\nNOT TOUCHED (internal, no user sees them — rerun with --deep + git mv the dirs):`);
  console.log(`  lib/realtyboss/  components/realtyboss/  app/api/dashboard/realtyboss/`);
  console.log(`  boss_* database identifiers (the assistant role, not the brand)`);
}

console.log(APPLY ? '\nDone. Review `git diff` before committing.\n' : '\nNo files written. Re-run with --apply.\n');
