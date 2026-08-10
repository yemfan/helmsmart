import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listTrending } from "@/lib/viralIntelligence";

export const runtime = "nodejs";

/** The shared viral library, best first. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  try {
    const items = await listTrending(12);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load trends." }, { status: 500 });
  }
}
