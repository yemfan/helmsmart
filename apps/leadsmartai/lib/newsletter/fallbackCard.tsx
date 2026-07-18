import "server-only";

import { ImageResponse } from "next/og";

/**
 * Branded fallback "news card" for a newsletter story that has no source photo
 * (e.g. FRED / government-data items with no og:image). Rendered at a 1200×630
 * banner aspect so it sits naturally alongside real source photos in the issue.
 * RealtyBoss-branded (the weekly digest is shared across all recipients).
 */

const BRAND = "#0072ce";
const INK = "#0f172a";
const MUTE = "#64748b";

function clampHeadline(h: string, max = 108): string {
  const s = (h || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, "").trim() + "…";
}

export async function renderFallbackCardPng(
  headline: string,
  categoryLabel: string,
): Promise<Uint8Array> {
  const res = new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: "26px",
              fontWeight: 700,
              letterSpacing: "3px",
              color: BRAND,
              textTransform: "uppercase",
            }}
          >
            {(categoryLabel || "This Week in Housing").toUpperCase()}
          </div>
          <div style={{ display: "flex", width: "72px", height: "6px", background: BRAND, marginTop: "16px" }} />
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "60px",
            fontWeight: 800,
            lineHeight: 1.12,
            color: INK,
            maxWidth: "1000px",
          }}
        >
          {clampHeadline(headline)}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #dbeafe",
            paddingTop: "24px",
          }}
        >
          <div style={{ display: "flex", fontSize: "28px", fontWeight: 800, color: BRAND }}>RealtyBoss</div>
          <div style={{ display: "flex", fontSize: "24px", color: MUTE }}>This Week in Housing</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
  return new Uint8Array(await res.arrayBuffer());
}
