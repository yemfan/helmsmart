import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCampaign, type CampaignMode } from "@/lib/campaigns";
import type { BrandBrief } from "@/lib/research";

export const runtime = "nodejs";

const MEDIA_TYPES = ["text", "image", "video"];
const CHANNELS = ["facebook", "instagram", "threads", "linkedin", "pinterest", "youtube", "tiktok"];

/** Save a researched campaign. */
export async function POST(req: Request) {
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

  const link = typeof body.link === "string" ? body.link.trim() : "";
  const brief = body.brief as BrandBrief | undefined;
  if (!link || !brief || typeof brief.summary !== "string") {
    return NextResponse.json({ error: "Research the link first." }, { status: 400 });
  }

  const mediaTypes = (Array.isArray(body.mediaTypes) ? body.mediaTypes : []).filter((m) =>
    MEDIA_TYPES.includes(m as string),
  ) as string[];
  const channels = (Array.isArray(body.channels) ? body.channels : []).filter((c) =>
    CHANNELS.includes(c as string),
  ) as string[];
  if (mediaTypes.length === 0) return NextResponse.json({ error: "Pick at least one content type." }, { status: 400 });
  if (channels.length === 0) return NextResponse.json({ error: "Pick at least one channel." }, { status: 400 });

  const frequency = Math.min(Math.max(Number(body.frequency) || 3, 1), 21);
  const budgetCredits =
    body.budgetCredits === null || body.budgetCredits === undefined || body.budgetCredits === ""
      ? null
      : Math.max(0, Number(body.budgetCredits) || 0);
  const mode: CampaignMode = body.mode === "auto" ? "auto" : "review";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : brief.name || "Campaign";

  try {
    const campaign = await createCampaign(user.id, {
      link,
      brief,
      name,
      mediaTypes,
      channels,
      frequency,
      budgetCredits,
      mode,
    });
    return NextResponse.json({ campaign });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save the campaign." }, { status: 500 });
  }
}
