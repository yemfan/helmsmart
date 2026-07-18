import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cronAuth";
import { isAnthropicConfigured } from "@/lib/anthropic";
import { listDueOptimizeRuns, optimizePlaybookRun } from "@/lib/realtyboss/playbook-runs/service";

export const runtime = "nodejs";
// Each optimize is one Claude call; process a batch sequentially per tick.
export const maxDuration = 300;

/**
 * GET /api/cron/playbook-optimize
 *
 * The autonomous "optimize as we go" loop. Each active playbook run carries a
 * `next_review_at` (set +7d at start, bumped +7d each optimize). This runs
 * DAILY and picks up every run whose review is due, running the optimize step
 * unattended: it reads the run's plan + elapsed context, has the AI propose
 * prioritized adjustments, records them on the run, and files an approval task —
 * so the plan self-reviews weekly while the agent still approves the changes.
 */
export async function GET(req: Request) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const due = await listDueOptimizeRuns(50);
  let optimized = 0;
  let failed = 0;

  for (const r of due) {
    try {
      const res = await optimizePlaybookRun(r.agent_id, r.id);
      if (res.ok) optimized += 1;
      else failed += 1;
    } catch (e) {
      console.error("[playbook-optimize] failed for", r.id, e);
      failed += 1;
    }
  }

  return NextResponse.json({ ok: true, due: due.length, optimized, failed });
}
