import type { ReactElement } from "react";

import { ImageResponse } from "next/og";

/**
 * Branded CAROUSEL slide renderer — Phase 3a, PR 2. Sibling of renderCard.tsx.
 *
 * A carousel is an ordered deck; this renders ONE 1080×1080 slide at a time so
 * the publisher (PR 3) can attach each slide image to a multi-image post. Three
 * layouts keyed on the slide's position in the deck:
 *   - cover (slide 0)      → the scroll-stopper: big hook on CloseBoss navy.
 *   - point (middle slides) → one idea: heading + one supporting line, light bg.
 *   - close (last slide)    → the CTA: soft ask on navy, brand mark.
 *
 * Pure next/og / satori — no external image or AI API. Branding degrades to the
 * CloseBoss wordmark when the agent has none, exactly like renderCard.
 */

const NAVY = "#0B1F44"; // CloseBoss brand navy
const ACCENT = "#0072ce"; // social-card blue (kept for family resemblance)
const GOLD = "#DAA017"; // CloseBoss brand gold
const INK = "#0f172a";
const MUTED = "#475569";
const SIZE = 1080;

export type SlideKind = "cover" | "point" | "close";

/** cover = first, close = last, everything between = point. A 1-slide deck is a cover. */
export function slideKind(index: number, total: number): SlideKind {
  if (index <= 0) return "cover";
  if (index >= total - 1) return "close";
  return "point";
}

/** Hard clamp so a long line never overflows the fixed canvas (satori won't ellipsize for us). */
function clamp(text: string, max: number): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim() + "…";
}

function footerLine(name: string | null, brokerage: string | null): string {
  const who = [name?.trim(), brokerage?.trim()].filter(Boolean).join(" · ");
  return who || "CloseBoss AI";
}

/** Small "n / total" progress marker, shown on every slide. */
function counter(index: number, total: number): string {
  return `${index + 1} / ${total}`;
}

export type CarouselSlideInput = {
  heading: string;
  body: string;
  index: number;
  total: number;
  /** Agent name / brokerage for the footer; null → "CloseBoss AI". */
  agentName?: string | null;
  brokerage?: string | null;
};

/**
 * Build the 1080×1080 ImageResponse for a single carousel slide.
 * Layout is chosen from (index, total) via slideKind().
 */
export function buildCarouselSlideImageResponse(input: CarouselSlideInput): ImageResponse {
  const { heading, body, index, total } = input;
  const kind = slideKind(index, total);
  const footer = footerLine(input.agentName ?? null, input.brokerage ?? null);
  const mark = counter(index, total);
  const font = "system-ui, -apple-system, Helvetica, Arial, sans-serif";

  let tree: ReactElement;

  if (kind === "cover") {
    tree = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "88px",
          background: `linear-gradient(160deg, ${NAVY} 0%, #0a1730 100%)`,
          fontFamily: font,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: "30px", fontWeight: 800, color: GOLD, letterSpacing: "0.04em" }}>
            CloseBoss
          </div>
          <div style={{ display: "flex", fontSize: "26px", fontWeight: 600, color: "#94a3b8" }}>{mark}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", width: "96px", height: "8px", borderRadius: "999px", background: GOLD }} />
          <div
            style={{
              display: "flex",
              fontSize: "96px",
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              maxWidth: "900px",
              marginTop: "36px",
            }}
          >
            {clamp(heading, 90)}
          </div>
          {body ? (
            <div style={{ display: "flex", fontSize: "40px", fontWeight: 500, color: "#cbd5e1", maxWidth: "880px", marginTop: "32px" }}>
              {clamp(body, 120)}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", fontSize: "32px", fontWeight: 700, color: ACCENT }}>Swipe →</div>
      </div>
    );
  } else if (kind === "close") {
    tree = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "88px",
          background: `linear-gradient(160deg, ${NAVY} 0%, #0a1730 100%)`,
          fontFamily: font,
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "26px", fontWeight: 600, color: "#94a3b8" }}>
          {mark}
        </div>

        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              fontSize: "76px",
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              maxWidth: "900px",
            }}
          >
            {clamp(heading, 110)}
          </div>
          {body ? (
            <div style={{ display: "flex", fontSize: "42px", fontWeight: 500, color: "#cbd5e1", maxWidth: "880px", marginTop: "32px" }}>
              {clamp(body, 140)}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #1e3a5f", paddingTop: "28px" }}>
          <div style={{ display: "flex", fontSize: "30px", fontWeight: 600, color: "#94a3b8", maxWidth: "760px", overflow: "hidden" }}>
            {footer}
          </div>
          <div style={{ display: "flex", fontSize: "30px", fontWeight: 800, color: GOLD }}>CloseBoss</div>
        </div>
      </div>
    );
  } else {
    // point
    tree = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#ffffff",
          fontFamily: font,
        }}
      >
        <div style={{ display: "flex", width: "24px", height: "100%", background: ACCENT }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "88px",
            width: "100%",
            background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "26px", fontWeight: 600, color: "#94a3b8" }}>
            {mark}
          </div>

          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                fontSize: "72px",
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                color: INK,
                maxWidth: "880px",
              }}
            >
              {clamp(heading, 100)}
            </div>
            {body ? (
              <div style={{ display: "flex", fontSize: "44px", fontWeight: 500, lineHeight: 1.28, color: MUTED, maxWidth: "860px", marginTop: "36px" }}>
                {clamp(body, 180)}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "28px", fontWeight: 800, color: ACCENT }}>
            CloseBoss
          </div>
        </div>
      </div>
    );
  }

  return new ImageResponse(tree, {
    width: SIZE,
    height: SIZE,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

/**
 * Render a single carousel slide to a PNG byte array — for storing at
 * generation time (upload to the social-images bucket). Mirrors renderCardPng.
 */
export async function renderCarouselSlidePng(input: CarouselSlideInput): Promise<Uint8Array> {
  const res = buildCarouselSlideImageResponse(input);
  return new Uint8Array(await res.arrayBuffer());
}
