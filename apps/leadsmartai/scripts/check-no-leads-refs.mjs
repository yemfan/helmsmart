#!/usr/bin/env node
/**
 * CI guard against post-rename regressions.
 *
 * The leads→contacts cluster migration (commit 3ded327f) renamed
 * the `leads` base table to a `contacts` base table with `leads`
 * kept as a backward-compat view. Two newer commits (b4255cb3 +
 * the contact-enrichment patch from this PR's parent thread) shipped
 * with stale `from("leads")` and `lead_id` references that broke
 * silently in production — the schema-audit pass in late April 2026
 * had to chase them across multiple migrations.
 *
 * This script fails CI if it detects any of:
 *   - `.from("leads")` / `.from('leads')` calls in TypeScript code
 *     under apps/leadsmartai/{app,lib,components}/
 *   - Object literal property `lead_id:` (the column was renamed
 *     to `contact_id`)
 *   - String literal `"lead_id"` / `'lead_id'` in `.eq()` / `.is()`
 *     / `.select()` chains (matches `eq("lead_id", …)` patterns)
 *
 * False-positive escape hatch: add `// allow-leads-ref: <reason>`
 * on the same line. The lib/email-tracking and lib/contact-enrichment
 * regressions never had a real reason — they were both copy-paste
 * misses — so very few legitimate uses should remain.
 *
 * Allowlist: a few legacy column names still need the `lead_id`
 * literal because the corresponding DB columns kept their
 * pre-rename names (e.g. lead_calls.lead_id, lead_tasks.lead_id,
 * lead_events.lead_id, contacts.merged_into_lead_id).
 * (message_logs.lead_id was renamed to contact_id by the
 * 20260702221347_drip_rail_uuid_contacts migration.)
 * Files in those allowlists below are skipped by the guard.
 */

import { readFileSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const TARGETS = [
  "apps/leadsmartai/app",
  "apps/leadsmartai/lib",
  "apps/leadsmartai/components",
];

/**
 * Files that legitimately reference `lead_id` because they query
 * tables whose actual DB columns still carry that name. Listed as
 * relative paths so they stay readable.
 */
const LEAD_ID_ALLOWLIST = new Set([
  // contacts.merged_into_lead_id is the canonical column name
  // (kept post-rename to avoid touching 13 callers).
  "apps/leadsmartai/lib/contact-enrichment/dedupe.ts",
  "apps/leadsmartai/lib/contact-enrichment/service.ts",
  "apps/leadsmartai/lib/contact-intake/findDuplicateCandidates.ts",
  "apps/leadsmartai/lib/dealPrediction/service.ts",
  "apps/leadsmartai/lib/mobile/calendarMobile.ts",
  "apps/leadsmartai/lib/mobile/dailyAgendaMobile.ts",
  "apps/leadsmartai/lib/mobile/inbox.ts",
]);

/**
 * Tables whose columns still legitimately use `lead_id` per the
 * live DB schema. The guard ignores `.eq("lead_id", …)` calls AND
 * `{ lead_id: … }` insert/update payloads when they appear within
 * a query against one of these tables.
 *
 * Detected via a 5-line lookback: if `from("<allowed-table>")`
 * appears within 5 lines before the lead_id reference, it's allowed.
 *
 * `lead_sequences` is the AI follow-up table created in the
 * 20260321 nurturing-system migration. It keyed off `leads.id`
 * pre-rename and continues to use `lead_id` post-rename — the
 * value still resolves to the same row in the renamed `contacts`
 * table because the cluster migration kept ids stable.
 */
const LEAD_ID_TABLE_ALLOWLIST = [
  "lead_calls",
  "lead_tasks",
  "lead_events",
  "lead_followups",
  "lead_sequences",
];

const FROM_LEADS_RE = /\.from\(\s*['"]leads['"]\s*\)/;
const LEAD_ID_OBJ_KEY_RE = /(?<![a-z_0-9])lead_id\s*:/i;
const LEAD_ID_STRING_RE = /['"]lead_id['"]/;
const ALLOW_COMMENT_RE = /\/\/\s*allow-leads-ref/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      yield path;
    }
  }
}

function relPath(absolute) {
  return relative(ROOT, absolute).split(sep).join("/");
}

/**
 * Walk back up to 5 lines looking for a `from("<table>")` call.
 * Returns the table name if found, or null.
 */
function tableContextFor(lines, lineIdx) {
  for (let i = lineIdx; i >= Math.max(0, lineIdx - 5); i--) {
    const m = lines[i].match(/\.from\(\s*['"]([a-z_]+)['"]\s*\)/);
    if (m) return m[1];
  }
  return null;
}

const violations = [];

for (const target of TARGETS) {
  const absTarget = join(ROOT, target);
  let exists = true;
  try {
    statSync(absTarget);
  } catch {
    exists = false;
  }
  if (!exists) continue;

  for (const filePath of walk(absTarget)) {
    const rel = relPath(filePath);
    const text = readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (ALLOW_COMMENT_RE.test(line)) continue;

      // 1. .from("leads") — never allowed; the view should not be queried.
      if (FROM_LEADS_RE.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          rule: 'from("leads")',
          source: line.trim(),
        });
      }

      // 2. lead_id: as an object property in inserts/updates.
      if (LEAD_ID_OBJ_KEY_RE.test(line) && !LEAD_ID_ALLOWLIST.has(rel)) {
        // Skip type declarations and comments — those are rare but
        // possible in lib/types.ts / column lists.
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) continue;
        if (/lead_id\?\s*:/.test(line)) continue; // optional type fields
        // Honor the same table-context allowlist used for string
        // literals — an insert/update payload against an allowlisted
        // table (e.g. lead_sequences) legitimately writes lead_id.
        const table = tableContextFor(lines, i);
        if (table && LEAD_ID_TABLE_ALLOWLIST.includes(table)) continue;
        violations.push({
          file: rel,
          line: i + 1,
          rule: "lead_id: (object key)",
          source: line.trim(),
        });
      }

      // 3. "lead_id" / 'lead_id' string literals in query chains.
      if (LEAD_ID_STRING_RE.test(line) && !LEAD_ID_ALLOWLIST.has(rel)) {
        const table = tableContextFor(lines, i);
        if (table && LEAD_ID_TABLE_ALLOWLIST.includes(table)) continue;
        violations.push({
          file: rel,
          line: i + 1,
          rule: '"lead_id" string',
          source: line.trim(),
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log("✓ No `from(\"leads\")` or stray `lead_id` references found.");
  process.exit(0);
}

console.error(
  `\n✗ Found ${violations.length} reference${violations.length === 1 ? "" : "s"} to the legacy leads schema:\n`,
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
  console.error(`    ${v.source.slice(0, 140)}`);
}
console.error(
  "\nThe leads→contacts cluster migration renamed the table; queries should use",
);
console.error(
  '  `.from("contacts")` and `contact_id`. If you genuinely need a leads-named',
);
console.error("  column (e.g. lead_calls.lead_id), add an allowlist entry in");
console.error("  apps/leadsmartai/scripts/check-no-leads-refs.mjs or annotate the");
console.error("  line with `// allow-leads-ref: <reason>`.\n");

process.exit(1);
