import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteCampaign, setCampaignFrequency, setCampaignStatus } from "@/lib/campaigns";

export const runtime = "nodejs";

/** Pause / resume a campaign, or change its posting cadence. */
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

  try {
    if (body.status === "paused" || body.status === "active") {
      await setCampaignStatus(user.id, id, body.status);
    }
    if (typeof body.frequency === "number") {
      await setCampaignFrequency(user.id, id, Math.min(Math.max(Math.round(body.frequency), 1), 21));
    }
    return NextResponse.json({ ok: true });
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
