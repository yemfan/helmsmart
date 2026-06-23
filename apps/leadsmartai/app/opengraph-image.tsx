import { ImageResponse } from "next/og";

/**
 * Root `og:image` for RealtorBoss — auto-detected by Next.js App Router.
 * Rendered on demand as a 1200×630 PNG from this JSX tree (Vercel OG).
 *
 * Same pattern as PropertyTools. Before this existed, `app/layout.tsx`
 * referenced `/images/og-default.png` which never existed on disk, so
 * every social share (LinkedIn, Twitter/X, iMessage, Facebook, Slack)
 * showed a broken preview. This file replaces the static asset with
 * a dynamically generated image that stays in sync with the brand.
 */

export const runtime = "edge";
export const alt = "RealtorBoss — Your AI Real Estate Team";
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "52px",
                height: "52px",
                background: "#0B1F44",
                borderRadius: "14px",
              }}
            >
              <svg width="34" height="34" viewBox="0 0 64 64">
                <path
                  d="M32 14 L16 28 L16 48 L48 48 L48 28 Z"
                  fill="none"
                  stroke="#D4A017"
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle cx="32" cy="14" r="3.2" fill="#D4A017" />
                <circle cx="16" cy="28" r="3.2" fill="#D4A017" />
                <circle cx="48" cy="28" r="3.2" fill="#D4A017" />
                <circle cx="16" cy="48" r="3.2" fill="#D4A017" />
                <circle cx="48" cy="48" r="3.2" fill="#D4A017" />
                <circle cx="32" cy="33" r="4" fill="#D4A017" />
              </svg>
            </div>
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
