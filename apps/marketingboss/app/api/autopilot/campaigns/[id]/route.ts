import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteCampaign, setCampaignStatus, updateCampaignSettings } from "@/lib/campaigns";

export const runtime = "nodejs";

const MEDIA = new Set(["text", "image", "video"]);

/** Pause / resume a campaign, or edit its settings (cadence, types, channels, budget, mode, name). */
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

    // Collect any settings fields present into one update.
    const fields: Parameters<typeof updateCampaignSettings>[2] = {};
    if (typeof body.name === "string" && body.name.trim()) fields.name = body.name.trim().slice(0, 120);
    if (typeof body.frequency === "number") {
      fields.frequency = Math.min(Math.max(Math.round(body.frequency), 1), 21);
    }
    if (Array.isArray(body.mediaTypes)) {
      const types = body.mediaTypes.filter((t): t is string => typeof t === "string" && MEDIA.has(t));
      if (types.length > 0) fields.media_types = types;
    }
    if (Array.isArray(body.channels)) {
      const chans = body.channels.filter((c): c is string => typeof c === "string" && c.length > 0);
      if (chans.length > 0) fields.channels = chans;
    }
    if (body.mode === "review" || body.mode === "auto") fields.mode = body.mode;
    if ("budgetCredits" in body) {
      const b = body.budgetCredits;
      fields.budget_credits = typeof b === "number" && b >= 0 ? Math.round(b) : null;
    }
    if ("autoApproveMaxCredits" in body) {
      const a = body.autoApproveMaxCredits;
      fields.auto_approve_max_credits = typeof a === "number" && a >= 0 ? Math.round(a) : null;
    }

    if (Object.keys(fields).length > 0) {
      await updateCampaignSettings(user.id, id, fields);
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
