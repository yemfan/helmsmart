import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCommunities } from "@/lib/communityIntelligence";

export const runtime = "nodejs";

/** Search the community library: text + platform/industry filters, savedOnly. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const url = new URL(req.url);
  try {
    const communities = await listCommunities(user.id, {
      q: url.searchParams.get("q") ?? undefined,
      platform: url.searchParams.get("platform") ?? undefined,
      industry: url.searchParams.get("industry") ?? undefined,
      savedOnly: url.searchParams.get("saved") === "1",
    });
    return NextResponse.json({ ok: true, communities });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load communities." }, { status: 500 });
  }
}
