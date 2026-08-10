import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchViral } from "@/lib/viralIntelligence";

export const runtime = "nodejs";

/** Search the viral library: text + platform/type/velocity filters. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const url = new URL(req.url);
  try {
    const items = await searchViral({
      q: url.searchParams.get("q") ?? undefined,
      platform: url.searchParams.get("platform") ?? undefined,
      contentType: url.searchParams.get("type") ?? undefined,
      velocity: url.searchParams.get("velocity") ?? undefined,
    });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Search failed." }, { status: 500 });
  }
}
