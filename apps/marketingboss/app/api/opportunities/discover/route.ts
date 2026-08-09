import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { discoverForUser } from "@/lib/discovery";

// The Trends scout does live web research — give it room.
export const maxDuration = 300;
export const runtime = "nodejs";

/** Scan every discovery source for the signed-in user, on demand. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  try {
    const result = await discoverForUser(user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Discovery failed — please try again." },
      { status: 500 },
    );
  }
}
