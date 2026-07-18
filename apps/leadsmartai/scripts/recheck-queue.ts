/**
 * Re-run the Boss's fact-check over posts already sitting in the queue.
 *
 * Needed whenever the checker itself changes. Posts cleared by an older, weaker
 * checker are still queued to publish — their 'clean' verdict is only as good as
 * the checker that produced it. This re-reads every unpublished post with the
 * CURRENT checker and demotes anything that no longer passes back to
 * awaiting_approval, with the reasoning attached.
 *
 * Only ever tightens: clean -> stays scheduled; flagged -> held for a human. It
 * will never promote a held post to publishable, so running it can't loosen the
 * gate.
 *
 * Usage (from apps/leadsmartai):
 *   npx tsx --conditions=react-server scripts/recheck-queue.ts --agent=26
 *   npx tsx --conditions=react-server scripts/recheck-queue.ts --agent=26 --apply
 */
import { readFileSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=([\s\S]*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* absent */
  }
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

type Row = {
  id: string;
  caption: string;
  status: string;
  platform: string;
  scheduled_for: string;
  subject_ref_id: string | null;
};

async function main() {
  const agentId = arg("agent", "26");
  const apply = process.argv.includes("--apply");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  const { reviewOutboundPost } = await import("../lib/social/reviewClaims");

  // Everything not yet published or dead.
  const rows = (await (
    await fetch(
      `${url}/rest/v1/scheduled_posts?select=id,caption,status,platform,scheduled_for,subject_ref_id` +
        `&agent_id=eq.${agentId}&status=in.(scheduled,awaiting_approval)&order=scheduled_for.asc`,
      { headers },
    )
  ).json()) as Row[];

  if (rows.length === 0) {
    console.log("nothing queued.");
    return;
  }

  // A rec's source_type decides the lens: cited news is judged differently from
  // marketing copy about ourselves.
  const refIds = [...new Set(rows.map((r) => r.subject_ref_id).filter(Boolean))];
  const kinds = new Map<string, string>();
  if (refIds.length) {
    const recs = (await (
      await fetch(
        `${url}/rest/v1/social_post_recommendations?select=id,source_type&id=in.(${refIds.join(",")})`,
        { headers },
      )
    ).json()) as { id: string; source_type: string }[];
    for (const r of recs) kinds.set(r.id, r.source_type);
  }

  console.log(`re-checking ${rows.length} queued post(s) for agent ${agentId} (apply: ${apply})\n`);

  let demoted = 0;
  let held = 0;
  for (const row of rows) {
    const kind =
      row.subject_ref_id && kinds.get(row.subject_ref_id) === "timely" ? "timely" : "brand";
    const review = await reviewOutboundPost(row.caption, kind);
    const when = row.scheduled_for.slice(0, 16).replace("T", " ");
    const first = row.caption.split("\n")[0].slice(0, 52);

    if (review.verdict === "clean") {
      if (row.status === "scheduled") console.log(`  ok        ${when}  ${row.platform.padEnd(9)} ${first}`);
      else { held++; console.log(`  held(was)  ${when}  ${row.platform.padEnd(9)} ${first}`); }
    } else {
      if (row.status === "scheduled") demoted++;
      console.log(`  FLAGGED   ${when}  ${row.platform.padEnd(9)} ${first}`);
      for (const i of review.issues.slice(0, 2)) {
        console.log(`            ↳ "${i.quote.slice(0, 50)}" — ${i.why.slice(0, 70)}`);
      }
    }

    if (!apply) continue;

    const patch =
      review.verdict === "clean"
        ? { review_verdict: "clean", review_issues: null, reviewed_at: new Date().toISOString() }
        : {
            status: "awaiting_approval",
            review_verdict: "flagged",
            review_issues: review.issues,
            reviewed_at: new Date().toISOString(),
          };
    const res = await fetch(`${url}/rest/v1/scheduled_posts?id=eq.${row.id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) console.error(`    ! patch failed: ${res.status} ${await res.text()}`);
  }

  console.log(
    `\n${rows.length} checked · ${demoted} demoted to awaiting_approval · ${held} already held`,
  );
  if (!apply) console.log("DRY RUN — nothing written. Re-run with --apply.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
