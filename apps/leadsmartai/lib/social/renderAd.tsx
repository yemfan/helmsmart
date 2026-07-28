import type { ReactElement } from "react";

import { ImageResponse } from "next/og";

/**
 * Branded PROMO AD renderer — single-image social ads (sibling of renderCard /
 * renderCarousel). Three LAYOUTS × several THEMES, so a rotation produces a dozen
 * visually distinct looks (the feed never looks monotonous, which also helps reach):
 *
 *   layouts: "bold" (statement + CTA pill + category row) · "photo" (photo hero
 *            + overlay) · "stat" (big figure / quote card)
 *   themes:  "navy" · "midnight" · "azure" (vivid blue) · "light" (clean white)
 *
 * Pure next/og / satori — no AI API. `photoUrl` (photo layout) must be publicly
 * fetchable; the CloseBoss logo mark is embedded when `logoUrl` is a valid URL
 * (on the light theme it falls back to a drawn navy mark, since the brand mark
 * sits on a white tile). Avoid glyphs outside the base font (▲/▼ etc. render as
 * tofu) — arrows ↑ ↓ → and the middot · are safe.
 */

export type AdTemplate = "bold" | "photo" | "stat";
export type AdFormat = "square" | "portrait" | "landscape";
export type AdTheme = "navy" | "midnight" | "azure" | "light";

type ThemeTokens = {
  bg: string; // full CSS background
  heading: string;
  body: string;
  eyebrow: string;
  gold: string; // accent (bar, category, brand url)
  pillBg: string;
  pillText: string;
  barBg: string;
  barText: string;
  divider: string;
  wordClose: string; // "CLOSE" wordmark color ("BOSS" always = gold)
  markColor: string; // drawn-mark color
  isLight: boolean; // gate the white-tile brand logo image
};

const THEMES: Record<AdTheme, ThemeTokens> = {
  navy: {
    bg: "linear-gradient(150deg, #0B1F44 0%, #0a1730 55%, #0072ce 135%)",
    heading: "#ffffff",
    body: "#c7dcf0",
    eyebrow: "#8fb8dd",
    gold: "#DAA017",
    pillBg: "linear-gradient(135deg, #f0d488 0%, #DAA017 100%)",
    pillText: "#0B1F44",
    barBg: "#06111f",
    barText: "#cbd5e1",
    divider: "#1e3a5f",
    wordClose: "#ffffff",
    markColor: "#DAA017",
    isLight: false,
  },
  midnight: {
    bg: "linear-gradient(160deg, #05070d 0%, #0b1424 60%, #16294a 100%)",
    heading: "#ffffff",
    body: "#aebdd0",
    eyebrow: "#7688a5",
    gold: "#E0B84B",
    pillBg: "linear-gradient(135deg, #f0d488 0%, #E0B84B 100%)",
    pillText: "#05070d",
    barBg: "#03040a",
    barText: "#aebdd0",
    divider: "#1c2740",
    wordClose: "#ffffff",
    markColor: "#E0B84B",
    isLight: false,
  },
  azure: {
    bg: "linear-gradient(145deg, #0a84e0 0%, #0060b0 65%, #00427d 120%)",
    heading: "#ffffff",
    body: "#dbeafe",
    eyebrow: "#b6d8f7",
    gold: "#ffd166",
    pillBg: "linear-gradient(135deg, #ffe29a 0%, #ffd166 100%)",
    pillText: "#06305a",
    barBg: "#003f78",
    barText: "#dbeafe",
    divider: "#1e5fa0",
    wordClose: "#ffffff",
    markColor: "#ffd166",
    isLight: false,
  },
  light: {
    bg: "linear-gradient(180deg, #ffffff 0%, #eef2f7 100%)",
    heading: "#0B1F44",
    body: "#475569",
    eyebrow: "#0072ce",
    gold: "#B8860B",
    pillBg: "linear-gradient(135deg, #123a5e 0%, #0B1F44 100%)",
    pillText: "#ffffff",
    barBg: "#0B1F44",
    barText: "#cbd5e1",
    divider: "#e2e8f0",
    wordClose: "#0B1F44",
    markColor: "#0B1F44",
    isLight: true,
  },
};

export type AdInput = {
  template: AdTemplate;
  headline: string;
  subhead?: string;
  ctaText?: string;
  statValue?: string;
  statLabel?: string;
  statContext?: string;
  photoUrl?: string;
  agentName?: string | null;
  brokerage?: string | null;
  /** Absolute logo/mark URL; falls back to a drawn mark if absent/malformed. */
  logoUrl?: string | null;
  /** Colour treatment (rotation dimension). Default "navy". */
  theme?: AdTheme;
  format?: AdFormat;
};

const DIMS: Record<AdFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  landscape: { w: 1200, h: 628 },
};

const FONT = "system-ui, -apple-system, Helvetica, Arial, sans-serif";
const CATEGORIES = "RECEPTIONIST   ·   SALES   ·   MARKETING   ·   TRANSACTION";

function usableLogoUrl(url?: string | null): string | null {
  const u = (url || "").trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

function clamp(text: string, max: number): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim() + "…";
}

function footerLine(name?: string | null, brokerage?: string | null): string {
  const who = [name?.trim(), brokerage?.trim()].filter(Boolean).join(" · ");
  return who || "CloseBoss AI";
}

/** CLOSE + BOSS wordmark. Real logo mark on dark themes; drawn mark on light. */
function Wordmark({ t, scale = 1, logoUrl }: { t: ThemeTokens; scale?: number; logoUrl?: string | null }): ReactElement {
  const s = (n: number) => `${Math.round(n * scale)}px`;
  const logo = t.isLight ? null : usableLogoUrl(logoUrl); // white-tile mark hides on light
  return (
    <div style={{ display: "flex", alignItems: "center", gap: s(16) }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={Math.round(52 * scale)} height={Math.round(52 * scale)} style={{ display: "flex", width: s(52), height: s(52), objectFit: "contain" }} />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: s(48), height: s(48), background: t.markColor, borderRadius: s(12) }}>
          <div style={{ display: "flex", width: s(20), height: s(20), background: t.gold, borderRadius: s(5) }} />
        </div>
      )}
      <div style={{ display: "flex", fontSize: s(40), fontWeight: 800, letterSpacing: "0.02em" }}>
        <div style={{ display: "flex", color: t.wordClose }}>CLOSE</div>
        <div style={{ display: "flex", color: t.gold }}>BOSS</div>
      </div>
    </div>
  );
}

function CtaPill({ t, label }: { t: ThemeTokens; label: string }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "26px 48px", borderRadius: "999px", background: t.pillBg, fontSize: "38px", fontWeight: 800, color: t.pillText }}>
      {`${clamp(label, 28)}  →`}
    </div>
  );
}

function BottomBar({ t, footer, w }: { t: ThemeTokens; footer: string; w: number }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", borderTop: `2px solid ${t.divider}`, paddingTop: "26px" }}>
      <div style={{ display: "flex", fontSize: "30px", fontWeight: 600, color: t.barText, maxWidth: `${w - 420}px`, overflow: "hidden" }}>{footer}</div>
      <div style={{ display: "flex", fontSize: "30px", fontWeight: 800, color: t.gold }}>closebossai.com</div>
    </div>
  );
}

export function buildAdImageResponse(input: AdInput): ImageResponse {
  const format = input.format ?? "square";
  const { w, h } = DIMS[format];
  const t = THEMES[input.theme ?? "navy"];
  const footer = footerLine(input.agentName, input.brokerage);
  const cta = input.ctaText?.trim();
  const pad = format === "landscape" ? 72 : 88;
  const headMax = format === "landscape" ? 60 : 90;
  const logoUrl = input.logoUrl;

  let inner: ReactElement;

  if (input.template === "stat") {
    inner = (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: `${pad}px`, background: t.bg, fontFamily: FONT }}>
        <Wordmark t={t} logoUrl={logoUrl} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: "96px", height: "8px", borderRadius: "999px", background: t.gold }} />
          <div style={{ display: "flex", fontSize: format === "landscape" ? "140px" : "220px", fontWeight: 800, color: t.heading, lineHeight: 1, marginTop: "24px", letterSpacing: "-0.03em" }}>
            {clamp(input.statValue || input.headline, 12)}
          </div>
          {input.statLabel ? (
            <div style={{ display: "flex", fontSize: "40px", fontWeight: 700, color: t.gold, marginTop: "18px", letterSpacing: "0.02em" }}>{clamp(input.statLabel, 46)}</div>
          ) : null}
          {input.statContext ? (
            <div style={{ display: "flex", fontSize: "38px", fontWeight: 500, color: t.body, marginTop: "18px", maxWidth: `${w - pad * 2}px` }}>{clamp(input.statContext, 90)}</div>
          ) : null}
        </div>
        <BottomBar t={t} footer={footer} w={w} />
      </div>
    );
  } else if (input.template === "photo" && input.photoUrl) {
    inner = (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: FONT }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={input.photoUrl} alt="" width={w} height={h} style={{ position: "absolute", top: 0, left: 0, width: `${w}px`, height: `${h}px`, objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: `${w}px`, height: `${h}px`, display: "flex", background: "linear-gradient(90deg, #0B1F44f2 0%, #0B1F44cc 48%, #0B1F4433 100%)" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", padding: `${pad}px` }}>
          <Wordmark t={THEMES.navy} logoUrl={logoUrl} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: format === "landscape" ? "72px" : "96px", fontWeight: 800, color: "#ffffff", lineHeight: 1.05, letterSpacing: "-0.02em", maxWidth: `${Math.round(w * 0.72)}px` }}>{clamp(input.headline, headMax)}</div>
            {input.subhead ? (
              <div style={{ display: "flex", fontSize: "36px", fontWeight: 500, color: "#dbe8f5", marginTop: "26px", maxWidth: `${Math.round(w * 0.66)}px` }}>{clamp(input.subhead, 110)}</div>
            ) : null}
            {cta ? <div style={{ display: "flex", marginTop: "40px" }}><CtaPill t={THEMES.navy} label={cta} /></div> : null}
          </div>
          <BottomBar t={THEMES.navy} footer={footer} w={w} />
        </div>
      </div>
    );
  } else {
    // "bold" statement layout.
    inner = (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: `${pad}px`, background: t.bg, fontFamily: FONT }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Wordmark t={t} logoUrl={logoUrl} />
          <div style={{ display: "flex", fontSize: "18px", fontWeight: 600, letterSpacing: "0.34em", color: t.eyebrow, marginTop: "14px" }}>YOUR AI REAL ESTATE TEAM</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: "96px", height: "8px", borderRadius: "999px", background: t.gold }} />
          <div style={{ display: "flex", fontSize: format === "landscape" ? "76px" : "104px", fontWeight: 800, color: t.heading, lineHeight: 1.04, letterSpacing: "-0.02em", marginTop: "32px", maxWidth: `${w - pad * 2}px` }}>{clamp(input.headline, headMax)}</div>
          {input.subhead ? (
            <div style={{ display: "flex", fontSize: "38px", fontWeight: 500, color: t.body, marginTop: "30px", maxWidth: `${w - pad * 2}px` }}>{clamp(input.subhead, 130)}</div>
          ) : null}
          {cta ? <div style={{ display: "flex", marginTop: "44px" }}><CtaPill t={t} label={cta} /></div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "26px" }}>
          <div style={{ display: "flex", fontSize: "24px", fontWeight: 700, letterSpacing: "0.12em", color: t.gold }}>{CATEGORIES}</div>
          <BottomBar t={t} footer={footer} w={w} />
        </div>
      </div>
    );
  }

  return new ImageResponse(inner, { width: w, height: h, headers: { "Cache-Control": "public, max-age=3600" } });
}

/** Render a promo ad to PNG bytes — for storing at generation time. */
export async function renderAdPng(input: AdInput): Promise<Uint8Array> {
  const res = buildAdImageResponse(input);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Rotation of distinct (layout × theme) looks, so consecutive posts don't repeat.
 * Presets that fix the layout (stat) rotate the THEME via pickThemeForIndex.
 */
const STYLE_ROTATION: Array<{ template: AdTemplate; theme: AdTheme }> = [
  { template: "bold", theme: "navy" },
  { template: "stat", theme: "azure" },
  { template: "bold", theme: "light" },
  { template: "stat", theme: "midnight" },
  { template: "bold", theme: "azure" },
  { template: "stat", theme: "navy" },
  { template: "bold", theme: "midnight" },
  { template: "stat", theme: "light" },
];

const THEME_ROTATION: AdTheme[] = ["navy", "azure", "midnight", "light"];

export function pickAdStyle(index: number): { template: AdTemplate; theme: AdTheme } {
  const n = STYLE_ROTATION.length;
  return STYLE_ROTATION[((index % n) + n) % n];
}

export function pickThemeForIndex(index: number): AdTheme {
  const n = THEME_ROTATION.length;
  return THEME_ROTATION[((index % n) + n) % n];
}
