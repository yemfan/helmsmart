import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteConnection } from "@/lib/social";

export const runtime = "nodejs";

// One provider can back multiple platform rows (Meta → facebook + instagram).
const PROVIDER_PLATFORMS: Record<string, string[]> = {
  meta: ["facebook", "instagram"],
  threads: ["threads"],
  linkedin: ["linkedin"],
  pinterest: ["pinterest"],
  youtube: ["youtube"],
  tiktok: ["tiktok"],
};

export async function POST(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const platforms = PROVIDER_PLATFORMS[provider];
  if (!platforms) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  for (const p of platforms) await deleteConnection(user.id, p).catch(() => {});
  return NextResponse.json({ ok: true });
}
