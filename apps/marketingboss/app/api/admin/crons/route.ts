import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CRON_JOBS, listJobSwitches, setJobEnabled, type CronJob } from "@/lib/cron/switches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminEmail(email: string | undefined): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

/** The signed-in admin, or null. These switches are global — every account's
 *  jobs — so an ordinary session is not enough, unlike the rest of the app. */
async function requireAdmin(): Promise<{ email: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email ?? undefined)) return null;
  return { email: user.email ?? "unknown" };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  return NextResponse.json({ ok: true, switches: await listJobSwitches(), jobs: CRON_JOBS });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { job?: unknown; enabled?: unknown };
  const job = String(body.job ?? "") as CronJob;
  if (!(job in CRON_JOBS)) {
    return NextResponse.json({ error: "Unknown job." }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be true or false." }, { status: 400 });
  }

  const res = await setJobEnabled(job, body.enabled, admin.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, switches: await listJobSwitches() });
}
