import { cn } from "@/lib/utils";

// RealtyBoss brand palette — matches the app-icon mark:
//   Indigo #4338CA (primary tile), Amber #F59E0B (crown accent), white "R".
const INDIGO = "#4338CA";
const AMBER = "#F59E0B";

type Tone = "light" | "dark";

/**
 * The RealtyBoss mark — an amber crown over a white "R" on an indigo tile.
 * Inline SVG, self-contained (its own indigo background) so it reads on any
 * surface; the `tone` prop is accepted for API compatibility but unused.
 * Master asset: public/brand/realtyboss/realtyboss-icon.svg (also app/icon.svg).
 */
export function RealtyBossMark({ className }: { className?: string; tone?: Tone }) {
  return (
    <svg viewBox="0 0 256 256" fill="none" aria-hidden className={cn("h-8 w-8", className)}>
      <rect x="44" y="78" width="168" height="160" rx="36" fill={INDIGO} />
      <g transform="translate(128,84) scale(0.83) translate(-128,-124)">
        <path d="M52 124 L84 66 L104 98 L128 48 L152 98 L172 66 L204 124 Z" fill={AMBER} />
        <circle cx="84" cy="66" r="6" fill={INDIGO} />
        <circle cx="128" cy="48" r="7" fill={INDIGO} />
        <circle cx="172" cy="66" r="6" fill={INDIGO} />
      </g>
      <path
        d="M138.81 210.00 L119.69 175.27 L114.30 175.27 L114.30 210.00 L91.90 210.00 L91.90 118.00 L129.52 118.00 Q140.39 118.00 148.05 121.81 Q155.72 125.60 159.51 132.23 Q163.32 138.84 163.32 146.97 Q163.32 156.15 158.14 163.35 Q152.96 170.56 142.87 173.57 L164.10 210.00 L138.81 210.00 Z M114.30 159.42 L128.20 159.42 Q134.35 159.42 137.42 156.41 Q140.51 153.38 140.51 147.87 Q140.51 142.63 137.42 139.62 Q134.35 136.61 128.20 136.61 L114.30 136.61 L114.30 159.42 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

type Props = {
  className?: string;
  /** Smaller variant for footers / compact nav (hides the tagline). */
  compact?: boolean;
  /** "dark" renders the wordmark body white for dark surfaces. */
  tone?: Tone;
};

/**
 * RealtyBoss horizontal lockup — crown+R mark + two-tone wordmark (+ tagline).
 * The wordmark renders as text in the app's heading font so it stays crisp and
 * theme-consistent: body indigo (white on dark), "Boss" in the amber accent.
 */
export function RealtyBossLogo({ className, compact, tone = "light" }: Props) {
  const body = tone === "dark" ? "#FFFFFF" : INDIGO;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <RealtyBossMark tone={tone} className={compact ? "h-8 w-8" : "h-10 w-10"} />
      <span className="flex flex-col items-center leading-none">
        <span className={cn("font-heading font-bold tracking-tight", compact ? "text-lg" : "text-2xl")}>
          <span style={{ color: body }}>Realty</span>
          <span style={{ color: AMBER }}>Boss</span>
        </span>
        {!compact && (
          <span
            className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: body }}
          >
            Your AI Real Estate Team
          </span>
        )}
      </span>
    </span>
  );
}
