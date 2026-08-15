import { NextResponse } from "next/server";

import { advanceAvatarRenderJobs } from "@/lib/agent/avatarJobs";

export const runtime = "nodejs";
/**
 * Deliberately short. Each tick does ONE non-blocking step per job — submit, or
 * check a submitted request once — so this handler never approaches the wall
 * that the old inline render kept hitting. If this ever needs 300s, something
 * is blocking that shouldn't be.
 */
export const maxDuration = 60;

/**
 * Vercel cron: advances background avatar renders. Every minute (vercel.json).
 *
 * A render outlives any single invocation because progress lives in
 * avatar_render_jobs, not in a call stack: one minute submits to fal, later
 * minutes poll it, and the last one stores the clip and notifies the agent.
 */
function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return true;
    return false;
  }
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorize(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const result = await advanceAvatarRenderJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    console.error("[cron/avatar-renders]", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
