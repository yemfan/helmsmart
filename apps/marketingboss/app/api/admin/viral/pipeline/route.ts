import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pipelineStats } from "@/lib/viralIntelligence";

export const runtime = "nodejs";

function isAdminEmail(email: string | undefined): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

/** Pipeline monitor: CRON_SECRET bearer or an ADMIN_EMAILS session. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization");
  let authorized = Boolean(secret && bearer === `Bearer ${secret}`);
  if (!authorized) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authorized = isAdminEmail(user?.email ?? undefined);
  }
  if (!authorized) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  try {
    return NextResponse.json({ ok: true, ...(await pipelineStats()) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stats failed." }, { status: 500 });
  }
}
