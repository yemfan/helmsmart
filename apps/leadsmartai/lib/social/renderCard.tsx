import type { ReactElement } from "react";

import { ImageResponse } from "next/og";

import type { PresentationAgent } from "@/lib/presentations/loadPresentationAgent";
import type { SocialRecommendation } from "@/lib/social/recommend";

/**
 * Reusable branded social-card renderer (extracted from the on-the-fly
 * /api/social/card/[id] route so the SAME JSX can be rendered ONCE at
 * generation time and stored in the social-images bucket).
 *
 * Two templates keyed on source_type, unchanged visually from the route:
 *   - timely    → a "MARKET UPDATE" stat card (headline stat from the caption).
 *   - evergreen → a friendly tip card (library category → a "… TIP" eyebrow).
 *
 * 1080×1080, pure next/og / satori — no external image/AI API. Branding
 * degrades gracefully to "CloseBoss AI" when the agent has none.
 *
 * NOTE: ImageResponse is edge/node-agnostic to construct, but callers that
 * feed it agent branding via the service-role client must run on nodejs.
 */

const BRAND_BLUE = "#0072ce";
const INK = "#0f172a";
const MUTED = "#475569";
const CARD_SIZE = 1080;

/**
 * Optional Signature brand kit: overrides the card accent color and stamps the
 * agent's logo. When absent the card renders in the default CloseBoss blue,
 * exactly as before (non-Signature agents are unaffected).
 */
export type BrandKit = {
  /** Hex accent color (e.g. "#0072ce"). Falls back to CloseBoss blue if empty/invalid. */
  color?: string | null;
  /** Public http(s) logo URL. satori fetches it; unusable URLs are dropped gracefully. */
  logoUrl?: string | null;
};

/** Accept a #RGB / #RRGGBB hex; otherwise fall back to CloseBoss blue. */
function resolveAccent(color?: string | null): string {
  if (typeof color !== "string") return BRAND_BLUE;
  const raw = color.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : BRAND_BLUE;
}

/** Only http(s) URLs are usable as a satori remote image. */
function usableLogoUrl(url?: string | null): string | null {
  if (typeof url !== "string") return null;
  const raw = url.trim();
  return /^https?:\/\//i.test(raw) ? raw : null;
}

/** First sentence / line of the caption, clamped so it never overflows the box. */
function headlineFromCaption(caption: string, max = 90): string {
  const firstLine = (caption || "").split(/\n/)[0]?.trim() ?? "";
  // Prefer a sentence boundary if the first line is long and has one early.
  const sentence = firstLine.split(/(?<=[.!?])\s/)[0]?.trim() || firstLine;
  const base = sentence.length >= 24 ? sentence : firstLine;
  const clean = base.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim() + "…";
}

/** Turn a raw library category into a friendly eyebrow, e.g. "seller" → "SELLER TIP". */
function tipEyebrow(category: string | null): string {
  const c = (category || "").toLowerCase();
  if (!c) return "REAL ESTATE TIP";
  if (c.includes("buy")) return "HOME BUYING TIP";
  if (c.includes("sell")) return "SELLER TIP";
  if (c.includes("stag")) return "HOME STAGING TIP";
  if (c.includes("invest")) return "INVESTOR TIP";
  if (c.includes("finance") || c.includes("mortgage") || c.includes("loan")) return "FINANCING TIP";
  if (c.includes("first")) return "FIRST-TIME BUYER TIP";
  if (c.includes("market")) return "MARKET TIP";
  // Fall back to the category itself, tidied.
  const label = category!.replace(/[-_]+/g, " ").trim().toUpperCase();
  return label ? `${label} TIP` : "REAL ESTATE TIP";
}

function footerLine(name: string | null, brokerage: string | null): string {
  const who = [name?.trim(), brokerage?.trim()].filter(Boolean).join(" · ");
  return who || "CloseBoss AI";
}

/**
 * Right-side brand mark in the card footer. Signature brand kit → the agent's
 * logo image (satori fetches the remote URL). No usable logo → the "CloseBoss"
 * wordmark in the accent color (the default behavior, now color-aware).
 *
 * satori needs explicit dimensions on <img>; we cap the logo height and let the
 * width auto-size. If satori can't fetch/decode the image at render time it
 * throws — the caller wraps rendering in try/fallback so the card never crashes.
 */
function brandMark(logoUrl: string | null, accent: string): ReactElement {
  if (logoUrl) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={logoUrl}
        alt=""
        height={56}
        style={{ display: "flex", height: "56px", maxWidth: "260px", objectFit: "contain" }}
      />
    );
  }
  return (
    <div style={{ display: "flex", fontSize: "26px", fontWeight: 700, color: accent }}>
      CloseBoss
    </div>
  );
}

/**
 * Build the 1080×1080 branded card ImageResponse for a recommendation.
 *
 * @param rec           the recommendation (source_type + caption drive the template/headline).
 * @param agent         branding (name + brokerage); null-tolerant → "CloseBoss AI".
 * @param categoryLabel raw library category for evergreen cards (→ "… TIP" eyebrow); ignored for timely.
 */
export function buildCardImageResponse(
  rec: Pick<SocialRecommendation, "source_type" | "caption">,
  agent: PresentationAgent | null,
  categoryLabel?: string | null,
  brandKit?: BrandKit | null,
): ImageResponse {
  const agentName = agent?.name ?? null;
  const brokerage = agent?.brokerage ?? null;
  const footer = footerLine(agentName, brokerage);

  const headline = headlineFromCaption(rec.caption);

  // Signature brand kit: accent color + optional logo. Absent → default blue.
  const accent = resolveAccent(brandKit?.color ?? null);
  const logoUrl = usableLogoUrl(brandKit?.logoUrl ?? null);

  const isTimely = rec.source_type === "timely";
  const eyebrow = isTimely ? "MARKET UPDATE" : tipEyebrow(categoryLabel ?? null);

  // Distinct treatments: timely = light gradient + accent bar; evergreen = a
  // blue side rail + oversized quote mark so the two read differently at a glance.
  const tree = isTimely ? (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "80px",
        background: "linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)",
        fontFamily: "system-ui, -apple-system, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Eyebrow */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: "30px",
            fontWeight: 700,
            letterSpacing: "0.16em",
            color: accent,
          }}
        >
          {eyebrow}
        </div>
        {/* Accent bar */}
        <div
          style={{
            display: "flex",
            width: "120px",
            height: "8px",
            marginTop: "24px",
            borderRadius: "999px",
            background: accent,
          }}
        />
      </div>

      {/* Headline stat */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: "76px",
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            color: INK,
            maxWidth: "920px",
          }}
        >
          {headline}
        </div>
      </div>

      {/* Footer: agent */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: `2px solid #dbeafe`,
          paddingTop: "28px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: "30px",
            fontWeight: 600,
            color: MUTED,
            maxWidth: "760px",
            overflow: "hidden",
          }}
        >
          {footer}
        </div>
        {brandMark(logoUrl, accent)}
      </div>
    </div>
  ) : (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#ffffff",
        fontFamily: "system-ui, -apple-system, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Blue side rail */}
      <div
        style={{
          display: "flex",
          width: "28px",
          height: "100%",
          background: accent,
        }}
      />
      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          width: "100%",
          background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
        }}
      >
        {/* Eyebrow */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: "30px",
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: accent,
            }}
          >
            {eyebrow}
          </div>
        </div>

        {/* Big quote */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "160px",
              fontWeight: 800,
              lineHeight: 0.7,
              color: "#bfdbfe",
              height: "96px",
            }}
          >
            &ldquo;
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "66px",
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: "-0.02em",
              color: INK,
              maxWidth: "880px",
              marginTop: "12px",
            }}
          >
            {headline}
          </div>
        </div>

        {/* Footer: agent */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid #e2e8f0`,
            paddingTop: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "30px",
              fontWeight: 600,
              color: MUTED,
              maxWidth: "760px",
              overflow: "hidden",
            }}
          >
            {footer}
          </div>
          {brandMark(logoUrl, accent)}
        </div>
      </div>
    </div>
  );

  return new ImageResponse(tree, {
    width: CARD_SIZE,
    height: CARD_SIZE,
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * Render the branded card to a PNG byte array — for storing at generation time
 * (upload to the social-images bucket). Wraps buildCardImageResponse.
 */
export async function renderCardPng(
  rec: Pick<SocialRecommendation, "source_type" | "caption">,
  agent: PresentationAgent | null,
  categoryLabel?: string | null,
  brandKit?: BrandKit | null,
): Promise<Uint8Array> {
  // Signature brand-kit render (custom color + remote logo) can fail if satori
  // can't fetch/decode the logo. Fall back to the default (blue, no-logo) card
  // so a brand-kit problem never aborts the run.
  if (brandKit && (brandKit.color || brandKit.logoUrl)) {
    try {
      const res = buildCardImageResponse(rec, agent, categoryLabel, brandKit);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      console.warn(
        "[social] brand-kit card render failed, falling back to default card:",
        e instanceof Error ? e.message : e,
      );
      // fall through to the default render below
    }
  }
  const res = buildCardImageResponse(rec, agent, categoryLabel);
  return new Uint8Array(await res.arrayBuffer());
}
