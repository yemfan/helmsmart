/**
 * Admin API: list cron jobs and manually trigger them.
 *
 * GET  /api/admin/cron-jobs          → list of jobs with schedule + last-run info
 * POST /api/admin/cron-jobs          → { path: "/api/cron/…" } to trigger a job now
 *
 * Both endpoints require an authenticated admin session.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSiteUrl } from "@/lib/siteUrl";
import { CRON_JOBS } from "@/lib/admin/cronJobs";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireAdmin(): Promise<{ ok: false; res: NextResponse } | { ok: true }> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  }

  // Check admin role
  const { data: profile } = await supabase
    .from("propertytools_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true };
}

// ─── GET – list jobs ──────────────────────────────────────────────────────────

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return ("res" in auth ? auth.res : NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

  return NextResponse.json({ ok: true, jobs: CRON_JOBS });
}

// ─── POST – trigger a job ────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return ("res" in auth ? auth.res : NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

  const body = await req.json().catch(() => ({}));
  const path = typeof body.path === "string" ? body.path.trim() : "";

  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const job = CRON_JOBS.find((j) => j.path === path);
  if (!job) {
    return NextResponse.json({ error: "Unknown job path" }, { status: 404 });
  }

  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const secret = process.env.CRON_SECRET?.trim();

  const targetUrl = `${siteUrl}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["Authorization"] = `Bearer ${secret}`;

  const start = Date.now();
  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(120_000), // 2 min max
    });

    const duration = Date.now() - start;
    let result: unknown;
    try {
      result = await res.json();
    } catch {
      result = { raw: await res.text() };
    }

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      duration,
      result,
    });
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      error: (e as Error).message ?? "Request failed",
      duration: Date.now() - start,
    });
  }
}
