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
 * degrades gracefully to "RealtyBoss AI" when the agent has none.
 *
 * NOTE: ImageResponse is edge/node-agnostic to construct, but callers that
 * feed it agent branding via the service-role client must run on nodejs.
 */

const BRAND_BLUE = "#0072ce";
const INK = "#0f172a";
const MUTED = "#475569";
const CARD_SIZE = 1080;

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
  return who || "RealtyBoss AI";
}

/**
 * Build the 1080×1080 branded card ImageResponse for a recommendation.
 *
 * @param rec           the recommendation (source_type + caption drive the template/headline).
 * @param agent         branding (name + brokerage); null-tolerant → "RealtyBoss AI".
 * @param categoryLabel raw library category for evergreen cards (→ "… TIP" eyebrow); ignored for timely.
 */
export function buildCardImageResponse(
  rec: Pick<SocialRecommendation, "source_type" | "caption">,
  agent: PresentationAgent | null,
  categoryLabel?: string | null,
): ImageResponse {
  const agentName = agent?.name ?? null;
  const brokerage = agent?.brokerage ?? null;
  const footer = footerLine(agentName, brokerage);

  const headline = headlineFromCaption(rec.caption);

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
            color: BRAND_BLUE,
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
            background: BRAND_BLUE,
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
        <div style={{ display: "flex", fontSize: "26px", fontWeight: 700, color: BRAND_BLUE }}>
          RealtyBoss
        </div>
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
          background: BRAND_BLUE,
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
              color: BRAND_BLUE,
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
          <div style={{ display: "flex", fontSize: "26px", fontWeight: 700, color: BRAND_BLUE }}>
            RealtyBoss
          </div>
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
): Promise<Uint8Array> {
  const res = buildCardImageResponse(rec, agent, categoryLabel);
  return new Uint8Array(await res.arrayBuffer());
}
