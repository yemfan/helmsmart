import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyLearning } from "@/lib/learnings";
import { getCampaign } from "@/lib/campaigns";

export const runtime = "nodejs";

/** Apply a learning to a playbook (or account-wide with campaignId null). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let campaignId: string | null = null;
  try {
    const body = (await req.json()) as { campaignId?: unknown };
    if (typeof body.campaignId === "string" && body.campaignId) campaignId = body.campaignId;
  } catch {
    /* account-wide apply */
  }

  if (campaignId) {
    const campaign = await getCampaign(user.id, campaignId);
    if (!campaign) return NextResponse.json({ error: "Playbook not found." }, { status: 404 });
  }

  try {
    await applyLearning(user.id, id, campaignId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Apply failed." }, { status: 500 });
  }
}
