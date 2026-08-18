/**
 * Brand Kit — per-user brand memory. The stored kit (see 0012_brand_kit.sql) is
 * folded into every AI draft's system prompt via {@link brandPromptContext} so
 * captions and image/video prompts come out on-brand. Pure/client-safe: the
 * routes and pages query `brand_kits` themselves and pass the row through here.
 */

export type BrandKit = {
  brand_name: string | null;
  voice: string | null;
  audience: string | null;
  primary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  /** Business profile (migration 0021) — present when selected with *. */
  company_url?: string | null;
};

/** Column list for selecting a brand kit row. */
/**
 * Columns every brand-aware read pulls. `company_url` is in the list because the
 * type has always declared it and the column has existed since 0021 — it was
 * simply never selected, so the composer fell back to a hardcoded placeholder
 * and posts went out with no link at all.
 */
export const BRAND_KIT_COLUMNS =
  "brand_name, voice, audience, primary_color, accent_color, logo_url, company_url";

const HEX = /^#?[0-9a-fA-F]{3,8}$/;

/**
 * A system-prompt addendum describing the brand, or "" when there's nothing
 * useful set — so an empty/missing kit leaves generation exactly as before.
 */
export function brandPromptContext(kit: BrandKit | null | undefined): string {
  if (!kit) return "";
  const lines: string[] = [];
  if (kit.brand_name?.trim()) lines.push(`Brand name: ${kit.brand_name.trim()}`);
  if (kit.voice?.trim()) lines.push(`Brand voice / about: ${kit.voice.trim()}`);
  if (kit.audience?.trim()) lines.push(`Target audience: ${kit.audience.trim()}`);
  const colors = [kit.primary_color, kit.accent_color]
    .filter((c): c is string => Boolean(c && HEX.test(c.trim())))
    .map((c) => c.trim())
    .join(", ");
  if (colors) lines.push(`Brand colors: ${colors} — reflect these in any imagePrompt.`);
  if (lines.length === 0) return "";
  return ["BRAND — keep the post consistent with this business:", ...lines].join("\n");
}
