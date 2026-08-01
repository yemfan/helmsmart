import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteCampaign, setCampaignStatus } from "@/lib/campaigns";

export const runtime = "nodejs";

/** Pause / resume a campaign. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const status = body.status === "paused" ? "paused" : body.status === "active" ? "active" : null;
  if (!status) return NextResponse.json({ error: "Unknown status." }, { status: 400 });

  try {
    await setCampaignStatus(user.id, id, status);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed." }, { status: 500 });
  }
}

/** Delete a campaign (cascades its posts). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  await deleteCampaign(user.id, id).catch(() => {});
  return NextResponse.json({ ok: true });
}
