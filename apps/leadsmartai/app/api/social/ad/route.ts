import { NextResponse } from "next/server";

import { requireCrmFeature } from "@/lib/billing/guard";
import { SOCIAL_CUSTOMIZATION_FEATURE } from "@/lib/social/customization";
import { persistAdDrafts } from "@/lib/social/ads";
import { scheduleAd, type AdPlatform } from "@/lib/social/scheduleAd";
import type { AdInput, AdFormat, AdTemplate, AdTheme } from "@/lib/social/renderAd";

/**
 * Ad Composer save endpoint. Persists a hand-composed ad into social_ads and,
 * when `schedule` is set, enqueues it to the connected accounts via scheduleAd.
 *
 * Signature/Team gated — same "bring your own creative" capability as the ad
 * photo pool. The render/publish side is unchanged: the stored row renders at
 * /api/social/ad/[id] and the publish-scheduled cron posts it.
 */
export const runtime = "nodejs";

const TEMPLATES: AdTemplate[] = ["bold", "photo", "stat", "spotlight", "feature"];
const THEMES: AdTheme[] = ["navy", "midnight", "azure", "light"];
const FORMATS: AdFormat[] = ["square", "portrait", "landscape"];

function s(v: unknown, max = 400): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

export async function POST(req: Request) {
  const gate = await requireCrmFeature(SOCIAL_CUSTOMIZATION_FEATURE);
  if (!gate.ok) return gate.response;
  const agentId = gate.ctx.agentId;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const template = TEMPLATES.includes(body.template as AdTemplate) ? (body.template as AdTemplate) : "bold";
  const theme = THEMES.includes(body.theme as AdTheme) ? (body.theme as AdTheme) : "navy";
  const format = FORMATS.includes(body.format as AdFormat) ? (body.format as AdFormat) : "square";

  const input: AdInput = {
    template,
    theme,
    format,
    headline: s(body.headline, 200) ?? "",
    headlineAccent: s(body.headlineAccent, 200),
    badge: s(body.badge, 40),
    subhead: s(body.subhead, 400),
    ctaText: s(body.ctaText, 60),
    statValue: s(body.statValue, 40),
    statLabel: s(body.statLabel, 80),
    statContext: s(body.statContext, 200),
    photoUrl: s(body.photoUrl, 800),
    agentName: s(body.agentName, 120) ?? null,
    brokerage: s(body.brokerage, 120) ?? null,
  };

  if (!input.headline && !input.photoUrl && !input.statValue) {
    return NextResponse.json(
      { ok: false, error: "Add a headline (or a stat / photo) before saving." },
      { status: 400 },
    );
  }

  const caption = s(body.caption, 2200) ?? "";
  const hashtags = Array.isArray(body.hashtags)
    ? (body.hashtags as unknown[])
        .map((h) => String(h).replace(/^#/, "").trim())
        .filter(Boolean)
        .slice(0, 30)
    : [];

  const [adId] = await persistAdDrafts(Number(agentId), [{ input, caption, hashtags, preset: null }]);
  if (!adId) {
    return NextResponse.json({ ok: false, error: "Could not save the ad." }, { status: 500 });
  }

  // Optional schedule. queueStatus: 'awaiting_approval' holds for review;
  // 'scheduled' publishes on the next cron tick.
  if (body.schedule) {
    const platforms = Array.isArray(body.platforms)
      ? (body.platforms as unknown[]).filter((p): p is AdPlatform =>
          p === "facebook" || p === "instagram" || p === "linkedin",
        )
      : undefined;
    const queueStatus = body.publishNow ? "scheduled" : "awaiting_approval";
    const res = await scheduleAd({ agentId: String(agentId), adId, platforms, queueStatus });
    return NextResponse.json({ ok: true, id: adId, scheduled: res.scheduled, error: res.error });
  }

  return NextResponse.json({ ok: true, id: adId, scheduled: 0 });
}
