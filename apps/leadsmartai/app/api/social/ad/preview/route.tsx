import { buildAdImageResponse, type AdFormat, type AdTemplate, type AdTheme } from "@/lib/social/renderAd";
import { buildPresetAd, type AdPreset } from "@/lib/social/adPresets";

/**
 * PREVIEW promo-ad image — GET /api/social/ad/preview?template=&headline=&...
 *
 * Renders an ad straight from query params (no storage), so the composer can show
 * a live preview as the agent edits copy. The stored/published image comes from
 * /api/social/ad/[id] instead. Public + read-only: it only rasterizes CloseBoss-
 * branded templates from text params — nothing sensitive is exposed.
 */
export const runtime = "nodejs";

const TEMPLATES: AdTemplate[] = ["bold", "photo", "stat", "spotlight", "feature", "hook"];
const FORMATS: AdFormat[] = ["square", "portrait", "landscape"];
const THEMES: AdTheme[] = ["navy", "midnight", "azure", "light"];

// CloseBoss hexagon mark (served from public/brand/closeboss/). Absolute URL is
// built from the request origin so satori can fetch it in dev and prod alike.
const BRAND_LOGO_PATH = "/brand/closeboss/closeboss-icon-512.png";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  const template = (q.get("template") as AdTemplate) || "bold";
  const format = (q.get("format") as AdFormat) || "square";
  const themeParam = q.get("theme") as AdTheme | null;
  const theme = themeParam && THEMES.includes(themeParam) ? themeParam : undefined;
  // Default to the CloseBoss mark; allow an override (e.g. an agent's logo).
  const logoUrl = q.get("logoUrl") || `${url.origin}${BRAND_LOGO_PATH}`;

  // Preset path — auto-fill from live warehouse data (interest rate / market update).
  const preset = q.get("preset") as AdPreset | null;
  if (preset) {
    const filled = await buildPresetAd(preset, {
      city: q.get("city") || undefined,
      photoUrl: q.get("photoUrl") || undefined,
      index: q.get("index") ? Number(q.get("index")) : undefined,
      theme,
      format: FORMATS.includes(format) ? format : "square",
    });
    if (filled) return buildAdImageResponse({ ...filled, logoUrl });
    // fall through to manual rendering if the preset had no data
  }

  return buildAdImageResponse({
    template: TEMPLATES.includes(template) ? template : "bold",
    format: FORMATS.includes(format) ? format : "square",
    theme,
    headline: q.get("headline") || "Missed calls cost you deals.",
    headlineAccent: q.get("headlineAccent") || undefined,
    badge: q.get("badge") || undefined,
    subhead: q.get("subhead") || undefined,
    ctaText: q.get("cta") || undefined,
    statValue: q.get("statValue") || undefined,
    statLabel: q.get("statLabel") || undefined,
    statContext: q.get("statContext") || undefined,
    photoUrl: q.get("photoUrl") || undefined,
    agentName: q.get("agentName") || undefined,
    brokerage: q.get("brokerage") || undefined,
    logoUrl,
  });
}
