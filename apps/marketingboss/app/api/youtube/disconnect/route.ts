import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteConnection } from "@/lib/social";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  await deleteConnection(user.id, "youtube").catch(() => {});
  return NextResponse.json({ ok: true });
}
