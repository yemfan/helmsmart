import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveCommunity, unsaveCommunity } from "@/lib/communityIntelligence";

export const runtime = "nodejs";

/** Save to a collection (default Favorites). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let collection: string | undefined;
  try {
    const body = (await req.json()) as { collection?: unknown };
    if (typeof body.collection === "string") collection = body.collection;
  } catch {
    /* default collection */
  }

  try {
    await saveCommunity(user.id, id, collection);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  await unsaveCommunity(user.id, id);
  return NextResponse.json({ ok: true });
}
