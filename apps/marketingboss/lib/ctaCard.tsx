import { ImageResponse } from "next/og";

/**
 * CTA end-card renderer — a branded closing frame appended to a marketing video.
 * Pure next/og / satori (no AI, no font file — system-ui renders Latin fine),
 * mirroring the leadsmartai promo-ad renderer. Colours + logo default to the
 * user's Brand Kit; the copy comes from the caller (Brand Kit / custom / AI).
 * Avoid glyphs outside the base font (▲▼ render as tofu); → is safe.
 */

export type CtaAspect = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";

const DIMS: Record<CtaAspect, { w: number; h: number }> = {
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "1:1": { w: 1080, h: 1080 },
  "4:3": { w: 1200, h: 900 },
  "3:4": { w: 900, h: 1200 },
};

const FONT = "system-ui, -apple-system, Helvetica, Arial, sans-serif";
const DEFAULT_PRIMARY = "#7c5cff"; // boss-violet
const DEFAULT_ACCENT = "#f5b301"; // boss-gold
const HEX = /^#?[0-9a-fA-F]{3,8}$/;

function color(c: string | null | undefined, fallback: string): string {
  const v = (c || "").trim();
  if (!HEX.test(v)) return fallback;
  return v.startsWith("#") ? v : `#${v}`;
}

function usableLogo(url?: string | null): string | null {
  const u = (url || "").trim();
  return /^https?:\/\//i.test(u) ? u : null;
}

function clamp(text: string, max: number): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim() + "…";
}

export type CtaCardInput = {
  headline: string;
  subline?: string | null;
  brandName?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  aspect?: CtaAspect;
};

export function ctaCardDims(aspect?: CtaAspect): { w: number; h: number } {
  return DIMS[aspect ?? "16:9"];
}

/** Render the CTA end card to PNG bytes (stored, then composed into a clip). */
export async function renderCtaCardPng(input: CtaCardInput): Promise<Uint8Array> {
  const { w, h } = ctaCardDims(input.aspect);
  const primary = color(input.primaryColor, DEFAULT_PRIMARY);
  const accent = color(input.accentColor, DEFAULT_ACCENT);
  const logo = usableLogo(input.logoUrl);
  const min = Math.min(w, h);
  const pad = Math.round(min * 0.11);
  const headSize = Math.round(min * 0.088);
  const subSize = Math.round(min * 0.04);
  const headline = clamp(input.headline || "Ready to get started?", 60);
  const subline = clamp(input.subline || "", 90);
  const brand = clamp(input.brandName || "", 40);

  const inner = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: `${Math.round(pad * 0.45)}px`,
        padding: `${pad}px`,
        background: `linear-gradient(150deg, ${primary} 0%, #0b0b16 135%)`,
        fontFamily: FONT,
        textAlign: "center",
      }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          width={Math.round(h * 0.13)}
          height={Math.round(h * 0.13)}
          style={{ display: "flex", width: `${Math.round(h * 0.13)}px`, height: `${Math.round(h * 0.13)}px`, objectFit: "contain", borderRadius: "18px" }}
        />
      ) : brand ? (
        <div style={{ display: "flex", fontSize: `${subSize}px`, fontWeight: 800, letterSpacing: "0.08em", color: "#ffffff" }}>
          {brand.toUpperCase()}
        </div>
      ) : null}

      <div style={{ display: "flex", width: `${Math.round(w * 0.12)}px`, height: "8px", borderRadius: "999px", background: accent }} />

      <div style={{ display: "flex", fontSize: `${headSize}px`, fontWeight: 800, color: "#ffffff", lineHeight: 1.05, letterSpacing: "-0.02em", maxWidth: `${w - pad * 2}px` }}>
        {headline}
      </div>

      {subline ? (
        <div style={{ display: "flex", fontSize: `${subSize}px`, fontWeight: 500, color: "#e6e2ff", maxWidth: `${Math.round(w * 0.84)}px`, lineHeight: 1.3 }}>
          {subline}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: `${Math.round(pad * 0.3)}px`,
          padding: `${Math.round(subSize * 0.7)}px ${Math.round(subSize * 1.5)}px`,
          borderRadius: "999px",
          background: accent,
          fontSize: `${Math.round(subSize * 1.05)}px`,
          fontWeight: 800,
          color: "#0b0b16",
        }}
      >
        {brand ? `${clamp(brand, 22)}  →` : "Learn more  →"}
      </div>
    </div>
  );

  const res = new ImageResponse(inner, { width: w, height: h });
  return new Uint8Array(await res.arrayBuffer());
}
