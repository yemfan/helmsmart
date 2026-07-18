/**
 * Expand the brand agent's OWNED social content library.
 *
 * The brand posts daily off `social_content_library` rows it owns (agent_id set,
 * category 'brand'). A small library means the same founder story resurfaces
 * every few weeks, so this tops it up with fresh AI-written brand copy.
 *
 * Content is generated, then screened by `brandClaimViolation` (invented
 * metrics, competitor names, pricing, promised outcomes) BEFORE anything is
 * written. Prints every draft for human review.
 *
 * Usage (from apps/leadsmartai):
 *   npx tsx --conditions=react-server scripts/seed-brand-content.ts            # dry run
 *   npx tsx --conditions=react-server scripts/seed-brand-content.ts --apply    # write
 *   ... --n=24 --agent=26
 *
 * The --conditions=react-server flag makes the `server-only` import resolve to
 * its empty stub instead of throwing outside Next's runtime.
 *
 * Idempotent: inserts ON CONFLICT (agent_id, title) DO NOTHING, and the
 * generator is given the existing titles so it writes NEW angles rather than
 * near-duplicates.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  brandClaimViolation,
  generateBrandBatch,
  type BrandPostDraft,
} from "../lib/social/generateBrandPosts";

/** Run from apps/leadsmartai (see usage above) — __dirname is absent under ESM. */
const ROOT = process.cwd();

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(path.join(ROOT, file), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const m = /^([A-Z0-9_]+)=([\s\S]*)$/.exec(line.trim());
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
      }
    } catch {
      /* file absent — fine */
    }
  }
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const n = Number(arg("n", "24"));
  const agentId = Number(arg("agent", "26"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // Existing titles → the generator writes NEW angles instead of re-treading.
  const existing = (await (
    await fetch(
      `${url}/rest/v1/social_content_library?select=title&agent_id=eq.${agentId}&category=eq.brand`,
      { headers },
    )
  ).json()) as { title: string }[];
  const existingTitles = existing.map((r) => r.title.replace(/^brand:/, ""));
  console.log(`agent ${agentId} already owns ${existingTitles.length} brand posts.`);
  console.log(`generating ${n} more (dry-run: ${!apply})…\n`);

  const drafts = await generateBrandBatch(n, existingTitles);
  if (drafts.length === 0) {
    console.error("generator returned nothing usable.");
    process.exit(1);
  }

  const kept: BrandPostDraft[] = [];
  const rejected: { post: BrandPostDraft; why: string }[] = [];
  for (const d of drafts) {
    const why = brandClaimViolation(d);
    if (why) rejected.push({ post: d, why });
    else kept.push(d);
  }

  for (const [i, d] of kept.entries()) {
    console.log(`── ${i + 1}. [${d.voice}] ${d.title}`);
    console.log(`${d.hook}\n\n${d.body}\n\n${d.cta}`);
    console.log(`#${d.hashtags.join(" #")}\n`);
  }
  if (rejected.length) {
    console.log(`\n!! REJECTED ${rejected.length} draft(s) — claim screen:`);
    for (const r of rejected) console.log(`   - "${r.post.title}": ${r.why}`);
  }
  console.log(
    `\ngenerated ${drafts.length} · kept ${kept.length} · rejected ${rejected.length}`,
  );

  if (!apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to insert.");
    return;
  }

  const rows = kept.map((d) => ({
    agent_id: agentId,
    category: "brand",
    title: `brand:${slug(d.title)}`,
    hook: d.hook,
    body: d.body,
    cta: d.cta,
    hashtags: d.hashtags,
    status: "active",
  }));

  const res = await fetch(
    `${url}/rest/v1/social_content_library?on_conflict=agent_id,title`,
    {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(rows),
    },
  );
  if (!res.ok) {
    console.error(`insert failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const inserted = (await res.json()) as unknown[];
  console.log(`\ninserted ${inserted.length} new brand posts for agent ${agentId}.`);
}

/** 'The Deal I Lost' → 'the_deal_i_lost' — matches the hand-seeded key style. */
function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
