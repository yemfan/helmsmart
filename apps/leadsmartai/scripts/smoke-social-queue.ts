/**
 * Smoke: does a week's social plan land in the queue HELD, not publishable?
 *
 * Runs the real generateWeeklyRecommendations against a real agent and asserts
 * the properties the approval gate depends on:
 *   1. every queued post is 'awaiting_approval' (review mode) — the publish cron
 *      claims only 'scheduled', so anything else here means posts go out unread
 *   2. posts are spread across distinct days, not all stacked on one tick
 *   3. evergreen picks come from content the agent OWNS (never another agent's)
 *
 * Usage (from apps/leadsmartai):
 *   npx tsx --conditions=react-server scripts/smoke-social-queue.ts --agent=26 --week=2026-07-20
 *
 * Idempotent: generateWeeklyRecommendations skips an (agent, week) it has
 * already planned, so re-running reports on the existing plan rather than
 * doubling it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=([\s\S]*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* absent — fine */
  }
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

async function main() {
  const agentId = arg("agent", "26");
  const week = arg("week", "");
  if (!week) throw new Error("--week=YYYY-MM-DD (a Monday) is required");

  // Imported AFTER env is loaded: the supabase client initialises at module load.
  const { generateWeeklyRecommendations, getSocialMode, getSocialPostsPerWeek } =
    await import("../lib/social/recommend");

  const mode = await getSocialMode(agentId);
  const cadence = await getSocialPostsPerWeek(agentId);
  console.log(`agent ${agentId}: mode=${mode}, posts_per_week=${cadence}, week=${week}`);

  const { count } = await generateWeeklyRecommendations(agentId, week);
  console.log(count > 0 ? `generated ${count} recommendations.` : "already planned — reporting on the existing plan.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const recs = (await (
    await fetch(
      `${url}/rest/v1/social_post_recommendations?select=id,source_type,library_id,status&agent_id=eq.${agentId}&week_of=eq.${week}`,
      { headers },
    )
  ).json()) as { id: string; source_type: string; library_id: string | null; status: string }[];

  const posts = (await (
    await fetch(
      `${url}/rest/v1/scheduled_posts?select=id,platform,status,scheduled_for,subject_ref_id&agent_id=eq.${agentId}&order=scheduled_for.asc`,
      { headers },
    )
  ).json()) as { platform: string; status: string; scheduled_for: string; subject_ref_id: string }[];

  const mine = posts.filter((p) => recs.some((r) => r.id === p.subject_ref_id));

  console.log(`\nrecommendations: ${recs.length} (${recs.filter((r) => r.source_type === "timely").length} timely, ${recs.filter((r) => r.source_type === "evergreen").length} evergreen)`);
  console.log(`queued posts:    ${mine.length}\n`);
  for (const p of mine) {
    console.log(`  ${p.scheduled_for.slice(0, 16).replace("T", " ")}Z  ${p.platform.padEnd(9)} ${p.status}`);
  }

  // ── the assertions that matter ────────────────────────────────────────────
  const problems: string[] = [];

  const publishable = mine.filter((p) => p.status !== "awaiting_approval");
  if (mode === "review" && publishable.length > 0) {
    problems.push(`${publishable.length} post(s) are NOT held for approval — they would publish unread`);
  }

  const days = new Set(mine.map((p) => p.scheduled_for.slice(0, 10)));
  if (mine.length > 0 && days.size < Math.min(cadence, mine.length / Math.max(1, new Set(mine.map((p) => p.platform)).size))) {
    problems.push(`posts are stacked: ${mine.length} posts across only ${days.size} day(s)`);
  }

  // Evergreen must come from content this agent owns or that is shared — never
  // another agent's private library.
  const libIds = recs.map((r) => r.library_id).filter(Boolean);
  if (libIds.length > 0) {
    const lib = (await (
      await fetch(
        `${url}/rest/v1/social_content_library?select=id,agent_id,category&id=in.(${libIds.join(",")})`,
        { headers },
      )
    ).json()) as { id: string; agent_id: number | null; category: string }[];
    const foreign = lib.filter((l) => l.agent_id !== null && String(l.agent_id) !== String(agentId));
    if (foreign.length > 0) problems.push(`${foreign.length} pick(s) came from ANOTHER agent's private library`);
    console.log(`\nevergreen sources: ${lib.filter((l) => String(l.agent_id) === String(agentId)).length} owned, ${lib.filter((l) => l.agent_id === null).length} shared, ${foreign.length} foreign`);
  }

  console.log(`\ndistinct publish days: ${days.size}`);
  if (problems.length) {
    console.error("\nFAIL:");
    problems.forEach((p) => console.error("  - " + p));
    process.exit(1);
  }
  console.log("\nPASS — the week is planned, spread, and held for approval.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
