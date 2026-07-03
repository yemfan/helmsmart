import { ImageResponse } from "next/og";

/**
 * Root `og:image` for RealtyBoss — auto-detected by Next.js App Router.
 * Rendered on demand as a 1200×630 PNG from this JSX tree (Vercel OG).
 *
 * Same pattern as PropertyTools. Before this existed, `app/layout.tsx`
 * referenced `/images/og-default.png` which never existed on disk, so
 * every social share (LinkedIn, Twitter/X, iMessage, Facebook, Slack)
 * showed a broken preview. This file replaces the static asset with
 * a dynamically generated image that stays in sync with the brand.
 */

const BRAND_MARK =
  "data:image/png;base64,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";

export const runtime = "edge";
export const alt = "RealtyBoss — Your AI Real Estate Team";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 40%, #eef2ff 100%)",
          fontFamily: "system-ui, -apple-system, Helvetica, Arial, sans-serif",
        }}
      >
        {/* Subtle radial accents */}
        <div
          style={{
            position: "absolute",
            top: "-140px",
            right: "-120px",
            width: "560px",
            height: "560px",
            background: "radial-gradient(circle, rgba(0,114,206,0.2) 0%, rgba(0,114,206,0) 70%)",
            borderRadius: "9999px",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-180px",
            left: "-120px",
            width: "520px",
            height: "520px",
            background: "radial-gradient(circle, rgba(255,140,66,0.15) 0%, rgba(255,140,66,0) 70%)",
            borderRadius: "9999px",
            display: "flex",
          }}
        />

        {/* Content column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "72px 80px",
            height: "100%",
            position: "relative",
          }}
        >
          {/* Brand mark + name */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              fontSize: "28px",
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            <img
              src={BRAND_MARK}
              width={52}
              height={52}
              style={{ borderRadius: "14px" }}
              alt=""
            />
            <div style={{ display: "flex" }}>
              <span style={{ color: "#0B1F44" }}>Realtor</span>
              <span style={{ color: "#D4A017" }}>Boss</span>
            </div>
          </div>

          {/* Middle: headline */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: "auto",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: "72px",
                fontWeight: 800,
                lineHeight: 1.02,
                letterSpacing: "-0.03em",
                color: "#0f172a",
                maxWidth: "1000px",
              }}
            >
              Hire an AI
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "72px",
                fontWeight: 800,
                lineHeight: 1.02,
                letterSpacing: "-0.03em",
                color: "#0f172a",
                maxWidth: "1000px",
              }}
            >
              Real Estate Team.
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "72px",
                fontWeight: 800,
                lineHeight: 1.02,
                letterSpacing: "-0.03em",
                color: "#D4A017",
                maxWidth: "1000px",
              }}
            >
              Close More Deals.
            </div>
          </div>

          {/* Bottom: feature row */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                fontSize: "24px",
                color: "#475569",
                lineHeight: 1.4,
                maxWidth: "960px",
              }}
            >
              Your AI Real Estate Team — from first call to closing.
            </div>
            <div style={{ display: "flex", gap: "24px", fontSize: "18px", color: "#0f172a", fontWeight: 500 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#10b981", fontSize: "20px" }}>✓</span>
                AI Receptionist
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#10b981", fontSize: "20px" }}>✓</span>
                AI Sales Assistant
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#10b981", fontSize: "20px" }}>✓</span>
                AI Transaction Assistant
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
