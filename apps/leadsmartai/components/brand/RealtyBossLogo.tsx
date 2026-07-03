import { cn } from "@/lib/utils";

// RealtyBoss brand palette — matches the app-icon mark:
//   Indigo #4338CA (primary tile), Amber #F59E0B (crown accent), white "R".
const INDIGO = "#4338CA";
const AMBER = "#F59E0B";

type Tone = "light" | "dark";

/**
 * The RealtyBoss mark — the house mascot on a purple tile. Rendered as the
 * generated raster icon so it matches the App Store / launcher icon exactly.
 * Master: public/brand/realtyboss/realtyboss-mascot.png (regenerated into
 * realtyboss-icon-512.png via scripts/generate-brand-icons.mjs). The `tone`
 * prop is accepted for API compatibility but unused (the tile is self-contained).
 */
export function RealtyBossMark({ className }: { className?: string; tone?: Tone }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/realtyboss/realtyboss-icon-512.png"
      alt="RealtyBoss"
      width={40}
      height={40}
      className={cn("h-8 w-8 rounded-[22%]", className)}
    />
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
 * RealtyBoss horizontal lockup — mascot mark + two-tone wordmark (+ tagline).
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
