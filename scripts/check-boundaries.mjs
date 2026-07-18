#!/usr/bin/env node
// HelmSmart dependency-law boundary checker (zero-dependency).
//
// The law (CDR-001 Option D): apps -> packs -> core.  Core NEVER imports a pack or an app.
// A feature with no @helm/* home cannot compile -> the Constitution's "no orphans" becomes mechanical.
//
//   CORE   = @helm/platform, @helm/data, @helm/ai-workforce, @helm/dna-*   (packages/*)
//            -> may import only other CORE packages. NOT @helm/pack-*, NOT apps/*.
//   PACK   = @helm/pack-*                                                   (industry-packs/*)
//            -> may import CORE. NOT other packs, NOT apps/*.
//
// Wire-up: `pnpm boundaries` (root package.json), and enforced on every PR by
// .github/workflows/boundaries.yml.
// It scans import/export/require specifiers in each package's src and fails on a violation.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CORE_DIRS = ['packages']; // any @helm/* package living here is CORE
const PACK_DIR = 'industry-packs';

// import-ish specifier extractor (good enough for a boundary gate; not a full parser)
const SPEC_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function listTsFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (e === 'node_modules' || e === 'dist' || e === '.next') continue;
      out.push(...listTsFiles(p));
    } else if (/\.(ts|tsx|mts|cts)$/.test(e)) {
      out.push(p);
    }
  }
  return out;
}

function specifiers(file) {
  const src = readFileSync(file, 'utf8');
  const specs = [];
  let m;
  while ((m = SPEC_RE.exec(src)) !== null) specs.push(m[1] || m[2] || m[3]);
  return specs;
}

function pkgName(pkgDir) {
  try {
    return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).name;
  } catch {
    return null;
  }
}

const violations = [];

// CORE packages: forbid importing @helm/pack-* or apps/*
for (const base of CORE_DIRS) {
  const baseDir = join(ROOT, base);
  if (!existsSync(baseDir)) continue;
  for (const dir of readdirSync(baseDir)) {
    const pkgDir = join(baseDir, dir);
    const name = pkgName(pkgDir);
    if (!name || !name.startsWith('@helm/') || name.startsWith('@helm/pack-')) continue; // only @helm/* core
    for (const file of listTsFiles(join(pkgDir, 'src'))) {
      for (const spec of specifiers(file)) {
        if (spec.startsWith('@helm/pack-') || spec.includes('industry-packs/') || /(^|\/)apps\//.test(spec)) {
          violations.push(`[core->pack/app] ${name}: ${file} imports "${spec}"`);
        }
      }
    }
  }
}

// PACK packages: forbid importing another pack or apps/*
const packBase = join(ROOT, PACK_DIR);
if (existsSync(packBase)) {
  for (const dir of readdirSync(packBase)) {
    const pkgDir = join(packBase, dir);
    const name = pkgName(pkgDir);
    if (!name) continue;
    for (const file of listTsFiles(join(pkgDir, 'src'))) {
      for (const spec of specifiers(file)) {
        const otherPack = spec.startsWith('@helm/pack-') && spec !== name && !spec.startsWith(name + '/');
        if (otherPack || /(^|\/)apps\//.test(spec)) {
          violations.push(`[pack->pack/app] ${name}: ${file} imports "${spec}"`);
        }
      }
    }
  }
}

if (violations.length) {
  console.error(`\n✗ HelmSmart boundary law violated (${violations.length}):\n`);
  for (const v of violations) console.error('  ' + v);
  console.error('\nLaw: apps -> packs -> core. Core must not import packs/apps; packs must not import other packs/apps.\n');
  process.exit(1);
}

console.log('✓ HelmSmart boundaries clean (apps -> packs -> core).');
