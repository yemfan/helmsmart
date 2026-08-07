import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX = /^#?[0-9a-fA-F]{3,8}$/;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
}
function hex(v: unknown): string | null {
  const s = str(v, 9);
  if (!s || !HEX.test(s)) return null;
  return s.startsWith("#") ? s : `#${s}`;
}

/** Save (upsert) the signed-in user's Brand Kit. RLS restricts it to their row. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const row = {
    user_id: user.id,
    brand_name: str(body.brand_name, 120),
    voice: str(body.voice, 1000),
    audience: str(body.audience, 400),
    primary_color: hex(body.primary_color),
    accent_color: hex(body.accent_color),
    logo_url: str(body.logo_url, 600),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("brand_kits").upsert(row, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
