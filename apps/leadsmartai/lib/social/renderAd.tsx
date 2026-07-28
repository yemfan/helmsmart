import type { ReactElement } from "react";

import { ImageResponse } from "next/og";

/**
 * Branded PROMO AD renderer — single-image social ads (sibling of renderCard /
 * renderCarousel). Three layouts for scroll-stopping, on-brand promo graphics:
 *
 *   - "bold"  → bold statement: big hook on CloseBoss navy + gold CTA pill.
 *   - "photo" → photo hero: a background photo with a navy overlay + headline/CTA.
 *   - "stat"  → stat / quote card: one big number or quote + context (great for
 *               real market data, e.g. "24 days on market · ↓2% YoY").
 *
 * Pure next/og / satori — no AI API. `photoUrl` (for the photo layout) must be a
 * publicly fetchable image; if it's missing the photo layout degrades to navy.
 * Branding degrades to the CloseBoss wordmark when the agent has none.
 */

const NAVY = "#0B1F44"; // CloseBoss brand navy
const NAVY_DEEP = "#0a1730";
const ACCENT = "#0072ce"; // CloseBoss blue
const GOLD = "#DAA017"; // CloseBoss brand gold
const GOLD_SOFT = "#f0d488";

export type AdTemplate = "bold" | "photo" | "stat";
export type AdFormat = "square" | "portrait" | "landscape";

export type AdInput = {
  template: AdTemplate;
  /** Main hook. */
  headline: string;
  /** Supporting line (bold/photo layouts). */
  subhead?: string;
  /** CTA pill label; omit to hide the pill. */
  ctaText?: string;
  /** stat layout — the big number/figure, its label, and one context line. */
  statValue?: string;
  statLabel?: string;
  statContext?: string;
  /** photo layout — publicly fetchable background image. */
  photoUrl?: string;
  /** Footer branding; null → "CloseBoss AI". */
  agentName?: string | null;
  brokerage?: string | null;
  /** Absolute logo/mark URL (e.g. the CloseBoss hexagon, or an agent brokerage
   * logo). Rendered next to the wordmark; falls back to a drawn mark if absent
   * or malformed. Must be a fetchable http(s) URL for satori to embed it. */
  logoUrl?: string | null;
  /** Canvas aspect. square 1080² · portrait 1080×1350 · landscape 1200×628. */
  format?: AdFormat;
};

/** Only accept a well-formed http(s) URL for the logo; else fall back to a mark. */
function usableLogoUrl(url?: string | null): string | null {
  const u = (url || "").trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

const DIMS: Record<AdFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  landscape: { w: 1200, h: 628 },
};

const FONT = "system-ui, -apple-system, Helvetica, Arial, sans-serif";
const CATEGORIES = "RECEPTIONIST   ·   SALES   ·   MARKETING   ·   TRANSACTION";

/** Hard clamp so a long line never overflows the fixed canvas. */
function clamp(text: string, max: number): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim() + "…";
}

function footerLine(name?: string | null, brokerage?: string | null): string {
  const who = [name?.trim(), brokerage?.trim()].filter(Boolean).join(" · ");
  return who || "CloseBoss AI";
}

/** CLOSE (white) + BOSS (gold) wordmark lockup. Uses the real logo mark image
 * when `logoUrl` is a valid URL; otherwise draws a simple gold mark. */
function Wordmark({ scale = 1, logoUrl }: { scale?: number; logoUrl?: string | null }): ReactElement {
  const s = (n: number) => `${Math.round(n * scale)}px`;
  const logo = usableLogoUrl(logoUrl);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: s(16) }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          width={Math.round(52 * scale)}
          height={Math.round(52 * scale)}
          style={{ display: "flex", width: s(52), height: s(52), objectFit: "contain" }}
        />
      ) : (
        <div style={{ display: "flex", width: s(40), height: s(44), border: `${s(4)} solid ${GOLD}`, borderRadius: s(6) }} />
      )}
      <div style={{ display: "flex", fontSize: s(40), fontWeight: 800, letterSpacing: "0.02em" }}>
        <div style={{ display: "flex", color: "#ffffff" }}>CLOSE</div>
        <div style={{ display: "flex", color: GOLD }}>BOSS</div>
      </div>
    </div>
  );
}

/** Gold CTA pill. */
function CtaPill({ label, size = 1 }: { label: string; size?: number }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: `${Math.round(26 * size)}px ${Math.round(48 * size)}px`,
        borderRadius: "999px",
        background: `linear-gradient(135deg, ${GOLD_SOFT} 0%, ${GOLD} 100%)`,
        fontSize: `${Math.round(38 * size)}px`,
        fontWeight: 800,
        color: NAVY,
      }}
    >
      {`${clamp(label, 28)}  →`}
    </div>
  );
}

function BottomBar({ footer, w }: { footer: string; w: number }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        borderTop: `2px solid #1e3a5f`,
        paddingTop: "26px",
      }}
    >
      <div style={{ display: "flex", fontSize: "30px", fontWeight: 600, color: "#cbd5e1", maxWidth: `${w - 420}px`, overflow: "hidden" }}>
        {footer}
      </div>
      <div style={{ display: "flex", fontSize: "30px", fontWeight: 800, color: GOLD }}>closebossai.com</div>
    </div>
  );
}

export function buildAdImageResponse(input: AdInput): ImageResponse {
  const format = input.format ?? "square";
  const { w, h } = DIMS[format];
  const footer = footerLine(input.agentName, input.brokerage);
  const cta = input.ctaText?.trim();
  const pad = format === "landscape" ? 72 : 88;
  const headMax = format === "landscape" ? 60 : 90;

  let inner: ReactElement;

  if (input.template === "stat") {
    // Big-figure card: oversized stat + label, then headline + context.
    inner = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: `${pad}px`,
          background: `linear-gradient(155deg, ${NAVY} 0%, ${NAVY_DEEP} 60%, ${ACCENT} 130%)`,
          fontFamily: FONT,
        }}
      >
        <Wordmark logoUrl={input.logoUrl} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: "96px", height: "8px", borderRadius: "999px", background: GOLD }} />
          <div style={{ display: "flex", fontSize: format === "landscape" ? "140px" : "220px", fontWeight: 800, color: "#ffffff", lineHeight: 1, marginTop: "24px", letterSpacing: "-0.03em" }}>
            {clamp(input.statValue || input.headline, 12)}
          </div>
          {input.statLabel ? (
            <div style={{ display: "flex", fontSize: "40px", fontWeight: 700, color: GOLD, marginTop: "18px", letterSpacing: "0.02em" }}>
              {clamp(input.statLabel, 46)}
            </div>
          ) : null}
          {input.statContext ? (
            <div style={{ display: "flex", fontSize: "38px", fontWeight: 500, color: "#c7dcf0", marginTop: "18px", maxWidth: `${w - pad * 2}px` }}>
              {clamp(input.statContext, 90)}
            </div>
          ) : null}
        </div>
        <BottomBar footer={footer} w={w} />
      </div>
    );
  } else if (input.template === "photo" && input.photoUrl) {
    // Photo hero: full-bleed image, navy gradient overlay, headline + CTA.
    inner = (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: FONT }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={input.photoUrl}
          alt=""
          width={w}
          height={h}
          style={{ position: "absolute", top: 0, left: 0, width: `${w}px`, height: `${h}px`, objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${w}px`,
            height: `${h}px`,
            display: "flex",
            background: `linear-gradient(90deg, ${NAVY}f2 0%, ${NAVY}cc 48%, ${NAVY}33 100%)`,
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            padding: `${pad}px`,
          }}
        >
          <Wordmark logoUrl={input.logoUrl} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: format === "landscape" ? "72px" : "96px", fontWeight: 800, color: "#ffffff", lineHeight: 1.05, letterSpacing: "-0.02em", maxWidth: `${Math.round(w * 0.72)}px` }}>
              {clamp(input.headline, headMax)}
            </div>
            {input.subhead ? (
              <div style={{ display: "flex", fontSize: "36px", fontWeight: 500, color: "#dbe8f5", marginTop: "26px", maxWidth: `${Math.round(w * 0.66)}px` }}>
                {clamp(input.subhead, 110)}
              </div>
            ) : null}
            {cta ? <div style={{ display: "flex", marginTop: "40px" }}><CtaPill label={cta} /></div> : null}
          </div>
          <BottomBar footer={footer} w={w} />
        </div>
      </div>
    );
  } else {
    // "bold" (default) statement layout.
    inner = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: `${pad}px`,
          background: `linear-gradient(150deg, ${NAVY} 0%, ${NAVY_DEEP} 55%, ${ACCENT} 135%)`,
          fontFamily: FONT,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Wordmark logoUrl={input.logoUrl} />
          <div style={{ display: "flex", fontSize: "18px", fontWeight: 600, letterSpacing: "0.34em", color: "#8fb8dd", marginTop: "14px" }}>
            YOUR AI REAL ESTATE TEAM
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: "96px", height: "8px", borderRadius: "999px", background: GOLD }} />
          <div style={{ display: "flex", fontSize: format === "landscape" ? "76px" : "104px", fontWeight: 800, color: "#ffffff", lineHeight: 1.04, letterSpacing: "-0.02em", marginTop: "32px", maxWidth: `${w - pad * 2}px` }}>
            {clamp(input.headline, headMax)}
          </div>
          {input.subhead ? (
            <div style={{ display: "flex", fontSize: "38px", fontWeight: 500, color: "#c7dcf0", marginTop: "30px", maxWidth: `${w - pad * 2}px` }}>
              {clamp(input.subhead, 130)}
            </div>
          ) : null}
          {cta ? <div style={{ display: "flex", marginTop: "44px" }}><CtaPill label={cta} /></div> : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "26px" }}>
          <div style={{ display: "flex", fontSize: "24px", fontWeight: 700, letterSpacing: "0.12em", color: GOLD }}>
            {CATEGORIES}
          </div>
          <BottomBar footer={footer} w={w} />
        </div>
      </div>
    );
  }

  return new ImageResponse(inner, {
    width: w,
    height: h,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

/** Render a promo ad to PNG bytes — for storing at generation time. */
export async function renderAdPng(input: AdInput): Promise<Uint8Array> {
  const res = buildAdImageResponse(input);
  return new Uint8Array(await res.arrayBuffer());
}
