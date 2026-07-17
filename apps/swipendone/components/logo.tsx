import type { CSSProperties } from "react";

// Brand colors from the official brand sheet (Design/swipendonedesign.png).
export const BRAND_CHARCOAL = "#0E2A24";
export const BRAND_ORANGE = "#FF6A00";

type Variant = "color" | "onDark";

/**
 * The SwipenDone brand mark — a single continuous ribbon "S" that flows from
 * charcoal into orange and ends in a forward arrow (swipe → progress → done).
 * Recreated as vector so it stays crisp at every size. `onDark` renders the
 * charcoal run in white for dark backgrounds (app icon, dark headers).
 */
export function LogoMark({
  height = 28,
  variant = "color",
  title = "SwipenDone",
  style,
}: {
  height?: number;
  variant?: Variant;
  title?: string;
  style?: CSSProperties;
}) {
  const inkRun = variant === "onDark" ? "#FFFFFF" : BRAND_CHARCOAL;
  const width = (height * 128) / 104;
  return (
    <svg
      role="img"
      aria-label={title}
      width={width}
      height={height}
      viewBox="0 0 128 104"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
    >
      <title>{title}</title>
      <g strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* charcoal run: top bar → left U-turn → into the middle */}
        <path d="M98 26 H40 A13 13 0 0 0 40 52 H64" stroke={inkRun} />
        {/* orange run: middle → right U-turn → bottom bar */}
        <path d="M60 52 H88 A13 13 0 0 1 88 78 H34" stroke={BRAND_ORANGE} />
      </g>
      {/* forward arrow */}
      <path d="M94 10 L94 42 L123 26 Z" fill={BRAND_ORANGE} />
    </svg>
  );
}

/**
 * Full horizontal lockup: mark + "swipen"(charcoal)/"done"(orange) wordmark.
 * `variant="onDark"` flips the ink parts to white.
 */
export function Logo({
  height = 28,
  variant = "color",
  wordmark = true,
  style,
}: {
  height?: number;
  variant?: Variant;
  wordmark?: boolean;
  style?: CSSProperties;
}) {
  const ink = variant === "onDark" ? "#FFFFFF" : BRAND_CHARCOAL;
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: height * 0.32, ...style }}
      aria-label="SwipenDone"
    >
      <LogoMark height={height} variant={variant} title="SwipenDone logo" />
      {wordmark && (
        <span
          aria-hidden
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: height * 0.82,
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          <span style={{ color: ink }}>swipen</span>
          <span style={{ color: BRAND_ORANGE }}>done</span>
        </span>
      )}
    </span>
  );
}
