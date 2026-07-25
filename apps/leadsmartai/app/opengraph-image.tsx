import { ImageResponse } from "next/og";

/**
 * Root `og:image` for CloseBoss — auto-detected by Next.js App Router.
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
export const alt = "CloseBoss — Your AI Real Estate Team";
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
              <span style={{ color: "#0B1F44" }}>Close</span>
              <span style={{ color: "#DAA017" }}>Boss</span>
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
                color: "#DAA017",
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
