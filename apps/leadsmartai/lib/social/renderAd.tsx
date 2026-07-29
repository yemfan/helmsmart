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

export type AdTemplate = "bold" | "photo" | "stat" | "spotlight" | "feature";
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
  solid: string; // darkest bg color — used for photo/vignette fades on spotlight
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
    solid: "#0B1F44",
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
    solid: "#05070d",
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
    solid: "#00325f",
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
    solid: "#ffffff",
  },
};

export type AdInput = {
  template: AdTemplate;
  headline: string;
  /** Spotlight only: a second headline line rendered in the accent colour
   *  (the "…YOU HAVE A CEILING." punch line under the white first line). */
  headlineAccent?: string;
  /** Spotlight only: the small tag chip above the headline (e.g. "BROKER-OWNERS"). */
  badge?: string;
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

/** Minimal geometric icons (satori-safe primitives: rect/circle/line/polygon/path).
 *  NOTE: satori chokes on React Fragments inside <svg> ("Cannot convert a Symbol
 *  value to a string") — return a KEYED ARRAY of elements, never a fragment. */
function Icon({ name, size = 34, color }: { name: string; size?: number; color: string }): ReactElement {
  const st = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  let shape: ReactElement[];
  switch (name) {
    case "bolt":
      shape = [<polygon key="a" points="13,2 4,14 11,14 9,22 20,9 12,9" fill={color} />];
      break;
    case "calendar":
      shape = [
        <rect key="a" x="3" y="4" width="18" height="17" rx="2" {...st} />,
        <line key="b" x1="3" y1="9" x2="21" y2="9" {...st} />,
        <line key="c" x1="8" y1="2" x2="8" y2="6" {...st} />,
        <line key="d" x1="16" y1="2" x2="16" y2="6" {...st} />,
      ];
      break;
    case "chat":
      shape = [<path key="a" d="M4 5h16v11H9l-4 4v-4H4z" {...st} />];
      break;
    case "home":
      shape = [
        <polygon key="a" points="12,3 22,11 2,11" fill={color} />,
        <rect key="b" x="5" y="11" width="14" height="10" {...st} />,
      ];
      break;
    case "clock":
      shape = [
        <circle key="a" cx="12" cy="12" r="9" {...st} />,
        <polyline key="b" points="12,7 12,12 16,14" {...st} />,
      ];
      break;
    case "chart":
      shape = [
        <rect key="a" x="4" y="13" width="4" height="7" fill={color} />,
        <rect key="b" x="10" y="9" width="4" height="11" fill={color} />,
        <rect key="c" x="16" y="5" width="4" height="15" fill={color} />,
      ];
      break;
    case "heart":
      shape = [<path key="a" d="M12 21C12 21 3 14 3 8.5 3 5.5 5.5 3 8.5 3c1.7 0 3 .8 3.5 2 .5-1.2 1.8-2 3.5-2C18.5 3 21 5.5 21 8.5 21 14 12 21 12 21z" fill={color} />];
      break;
    case "target":
      shape = [
        <circle key="a" cx="12" cy="12" r="9" {...st} />,
        <circle key="b" cx="12" cy="12" r="5" {...st} />,
        <circle key="c" cx="12" cy="12" r="1.6" fill={color} />,
      ];
      break;
    default:
      shape = [<circle key="a" cx="12" cy="12" r="9" {...st} />];
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "flex" }}>
      {shape}
    </svg>
  );
}

function Stars({ color }: { color: string }): ReactElement {
  const pts = "10,1 12.4,7 19,7 13.6,11.4 15.6,18 10,14 4.4,18 6.4,11.4 1,7 7.6,7";
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 20 20" style={{ display: "flex" }}>
          <polygon points={pts} fill={color} />
        </svg>
      ))}
    </div>
  );
}

function FeatureRow({ t, icon, title, desc }: { t: ThemeTokens; icon: string; title: string; desc: string }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "62px", height: "62px", borderRadius: "999px", border: `2px solid ${t.gold}` }}>
        <Icon name={icon} size={32} color={t.gold} />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: "27px", fontWeight: 800, color: t.heading, letterSpacing: "0.02em" }}>{title}</div>
        <div style={{ display: "flex", fontSize: "23px", fontWeight: 500, color: t.body }}>{desc}</div>
      </div>
    </div>
  );
}

function BenefitItem({ t, icon, strong, rest }: { t: ThemeTokens; icon: string; strong: string; rest: string }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <Icon name={icon} size={34} color={t.gold} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: "20px", fontWeight: 800, color: t.heading }}>{strong}</div>
        <div style={{ display: "flex", fontSize: "20px", fontWeight: 700, color: t.gold }}>{rest}</div>
      </div>
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
  } else if (input.template === "feature") {
    // "feature" — a full capability poster (portrait): header lockup, two-tone
    // hero, a 4-item feature list, a model photo with a gold seal, a benefits
    // strip, and a CTA bar. Brand content is fixed; hero/subhead/cta/photo/seal
    // are overridable.
    const fp = 56;
    const heroSize = 88;
    const photoW = Math.round(w * 0.38);
    const seal = clamp(input.statLabel || "Hours back every week", 26);
    const features = [
      { icon: "bolt", title: "AI LEAD RESPONSE", desc: "Instant. 24/7." },
      { icon: "calendar", title: "SMART SCHEDULING", desc: "More showings. Less back & forth." },
      { icon: "chat", title: "AI FOLLOW-UP", desc: "Nurture every lead. Never miss one." },
      { icon: "home", title: "CLOSE MORE DEALS", desc: "Better conversations. More closings." },
    ];
    const benefits = [
      { icon: "clock", strong: "MORE TIME", rest: "for what matters" },
      { icon: "chart", strong: "MORE DEALS", rest: "to close" },
      { icon: "heart", strong: "LESS STRESS", rest: "more success" },
      { icon: "target", strong: "STAY FOCUSED", rest: "on closing" },
    ];
    inner = (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: t.bg, fontFamily: FONT, padding: `${fp}px`, justifyContent: "space-between" }}>
        {/* header lockup */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <Wordmark t={t} logoUrl={logoUrl} scale={1.05} />
          <div style={{ display: "flex", fontSize: "22px", fontWeight: 700, letterSpacing: "0.14em" }}>
            <span style={{ display: "flex", color: t.eyebrow }}>YOUR AI REAL ESTATE TEAM</span>
            <span style={{ display: "flex", color: t.gold, marginLeft: "10px" }}>· NEVER STOPS CLOSING</span>
          </div>
        </div>

        {/* hero + features (left) | photo + seal (right) */}
        <div style={{ display: "flex", gap: "36px" }}>
          <div style={{ display: "flex", flexDirection: "column", width: `${w - fp * 2 - photoW - 36}px` }}>
            <div style={{ display: "flex", fontSize: `${heroSize}px`, fontWeight: 800, color: t.heading, lineHeight: 1.0, letterSpacing: "-0.02em" }}>{clamp(input.headline || "GET YOUR", 18).toUpperCase()}</div>
            <div style={{ display: "flex", fontSize: `${heroSize}px`, fontWeight: 800, color: t.gold, lineHeight: 1.0, letterSpacing: "-0.02em" }}>{clamp(input.headlineAccent || "LIFE BACK.", 18).toUpperCase()}</div>
            <div style={{ display: "flex", width: "120px", height: "7px", borderRadius: "999px", background: t.gold, marginTop: "20px" }} />
            <div style={{ display: "flex", fontSize: "26px", fontWeight: 500, color: t.body, marginTop: "22px", lineHeight: 1.3 }}>{clamp(input.subhead || "CloseBoss AI handles the busywork so you can focus on what matters and close more deals.", 130)}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: "32px" }}>
              {features.map((f) => (
                <FeatureRow key={f.title} t={t} icon={f.icon} title={f.title} desc={f.desc} />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", position: "relative", width: `${photoW}px` }}>
            {input.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={input.photoUrl} alt="" width={photoW} height={Math.round(h * 0.5)} style={{ width: `${photoW}px`, height: `${Math.round(h * 0.5)}px`, objectFit: "cover", borderRadius: "20px" }} />
            ) : (
              <div style={{ display: "flex", width: `${photoW}px`, height: `${Math.round(h * 0.5)}px`, borderRadius: "20px", border: `2px dashed ${t.divider}`, background: `${t.solid}55`, alignItems: "flex-end", justifyContent: "center", padding: "20px" }}>
                <div style={{ display: "flex", fontSize: "20px", color: t.eyebrow, textAlign: "center" }}>your photo</div>
              </div>
            )}
            {/* gold seal — overlaps the photo's lower-left */}
            <div style={{ position: "absolute", left: "-38px", bottom: `${Math.round(h * 0.06)}px`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "216px", height: "216px", borderRadius: "999px", background: t.pillBg, padding: "16px" }}>
              <Icon name="clock" size={40} color={t.pillText} />
              <div style={{ display: "flex", fontSize: "27px", fontWeight: 900, color: t.pillText, textAlign: "center", marginTop: "6px", lineHeight: 1.05, letterSpacing: "0.01em" }}>{seal.toUpperCase()}</div>
              <div style={{ display: "flex", marginTop: "8px" }}><Stars color={t.pillText} /></div>
            </div>
          </div>
        </div>

        {/* benefits strip */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${t.divider}`, borderBottom: `2px solid ${t.divider}`, paddingTop: "24px", paddingBottom: "24px" }}>
          {benefits.map((b) => (
            <BenefitItem key={b.strong} t={t} icon={b.icon} strong={b.strong} rest={b.rest} />
          ))}
        </div>

        {/* CTA bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `2px solid ${t.gold}`, borderRadius: "18px", padding: "26px 34px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "38px", fontWeight: 800, color: t.heading }}>Focus on closing.</div>
            <div style={{ display: "flex", fontSize: "38px", fontWeight: 800, color: t.gold }}>We&apos;ll handle the rest.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 34px", borderRadius: "999px", background: t.pillBg, fontSize: "30px", fontWeight: 800, color: t.pillText }}>{`${clamp(cta || "Book a demo", 20)}  →`}</div>
        </div>

        {/* footer contact */}
        <div style={{ display: "flex", justifyContent: "center", gap: "40px", fontSize: "26px", fontWeight: 700, color: t.gold }}>
          <div style={{ display: "flex" }}>closebossai.com</div>
          <div style={{ display: "flex", color: t.body }}>contact@closebossai.com</div>
        </div>
      </div>
    );
  } else if (input.template === "spotlight") {
    // "spotlight" — dark direct-response layout: tag chip → two-tone headline →
    // supporting line → highlighted promise → CTA pill → proof line, with a model
    // photo bleeding in from the right and a rising-line motif behind it.
    const isPortrait = format === "portrait";
    const headSize = format === "landscape" ? 58 : isPortrait ? 92 : 84;
    const textMax = Math.round(w * (format === "landscape" ? 0.6 : 0.62));
    // Photo occupies the right band; a left-edge fade blends it into the bg.
    const photoW = Math.round(w * (format === "landscape" ? 0.52 : 0.5));
    inner = (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: t.bg, fontFamily: FONT }}>
        {/* rising-line motif */}
        <div style={{ position: "absolute", top: `${Math.round(h * 0.16)}px`, right: `${Math.round(w * 0.04)}px`, display: "flex", opacity: 0.5 }}>
          <svg width={Math.round(w * 0.56)} height={Math.round(h * 0.34)} viewBox="0 0 600 360" fill="none">
            <polyline points="10,330 190,250" stroke={t.gold} strokeWidth="6" strokeLinecap="round" />
            <line x1="190" y1="250" x2="380" y2="250" stroke={t.gold} strokeWidth="5" strokeDasharray="14 16" strokeLinecap="round" />
            <polyline points="380,250 590,50" stroke={t.gold} strokeWidth="6" strokeLinecap="round" />
            <circle cx="380" cy="250" r="14" fill={t.gold} />
            <circle cx="590" cy="50" r="10" fill={t.gold} />
          </svg>
        </div>
        {input.photoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={input.photoUrl} alt="" width={photoW} height={h} style={{ position: "absolute", top: 0, right: 0, width: `${photoW}px`, height: `${h}px`, objectFit: "cover" }} />
            {/* left fade → blends the photo's inner edge into the dark bg */}
            <div style={{ position: "absolute", top: 0, right: 0, width: `${photoW + 40}px`, height: `${h}px`, display: "flex", background: `linear-gradient(90deg, ${t.solid} 0%, ${t.solid}dd 22%, ${t.solid}00 60%)` }} />
            {/* bottom fade → seats the model on the base */}
            <div style={{ position: "absolute", bottom: 0, right: 0, width: `${photoW}px`, height: `${Math.round(h * 0.3)}px`, display: "flex", background: `linear-gradient(0deg, ${t.solid} 0%, ${t.solid}00 100%)` }} />
          </>
        ) : null}
        {/* foreground column */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: `${pad}px` }}>
          <Wordmark t={t} logoUrl={logoUrl} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {input.badge ? (
              <div style={{ display: "flex", marginBottom: "28px" }}>
                <div style={{ display: "flex", padding: "12px 22px", borderRadius: "8px", background: t.gold, color: t.pillText, fontSize: "26px", fontWeight: 800, letterSpacing: "0.1em" }}>
                  {clamp(input.badge, 22).toUpperCase()}
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", fontSize: `${headSize}px`, fontWeight: 800, color: t.heading, lineHeight: 1.02, letterSpacing: "-0.02em", maxWidth: `${textMax}px` }}>
              {clamp(input.headline, 40)}
            </div>
            {input.headlineAccent ? (
              <div style={{ display: "flex", fontSize: `${headSize}px`, fontWeight: 800, color: t.gold, lineHeight: 1.02, letterSpacing: "-0.02em", maxWidth: `${textMax}px`, marginTop: "4px" }}>
                {clamp(input.headlineAccent, 40)}
              </div>
            ) : null}
            {input.subhead ? (
              <div style={{ display: "flex", fontSize: "34px", fontWeight: 500, color: t.body, marginTop: "28px", maxWidth: `${textMax}px`, lineHeight: 1.3 }}>
                {clamp(input.subhead, 120)}
              </div>
            ) : null}
            {input.statLabel ? (
              <div style={{ display: "flex", fontSize: "38px", fontWeight: 800, color: t.gold, marginTop: "20px", maxWidth: `${textMax}px`, lineHeight: 1.2 }}>
                {clamp(input.statLabel, 60)}
              </div>
            ) : null}
            {cta ? <div style={{ display: "flex", marginTop: "40px" }}><CtaPill t={t} label={cta} /></div> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {input.statContext ? (
              <div style={{ display: "flex", fontSize: "28px", fontWeight: 600, color: t.body, maxWidth: `${textMax}px` }}>{clamp(input.statContext, 80)}</div>
            ) : null}
            <BottomBar t={t} footer={footer} w={w} />
          </div>
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
