import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { synthesizeLearnings } from "@/lib/learnings";

export const runtime = "nodejs";

/** Re-run the learning synthesizer for the signed-in user, on demand. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  try {
    const created = await synthesizeLearnings(user.id);
    return NextResponse.json({ created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Synthesis failed — please try again." },
      { status: 500 },
    );
  }
}
