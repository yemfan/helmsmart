import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { discoverCommunitiesForUser } from "@/lib/communityIntelligence";

// Live web research on the business's audience — give it room.
export const maxDuration = 300;
export const runtime = "nodejs";

/** On-demand community discovery, driven by the user's business profile. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  try {
    const result = await discoverCommunitiesForUser(user.id);
    if (!result) return NextResponse.json({ error: "Community discovery isn't set up yet." }, { status: 503 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Discovery failed — please try again." },
      { status: 500 },
    );
  }
}
