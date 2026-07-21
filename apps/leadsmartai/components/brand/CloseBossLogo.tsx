import { cn } from "@/lib/utils";

// CloseBoss brand palette — navy team + gold "Boss" core (see the brand mark:
// six AI employees in a hexagon around the gold BOSS sphere).
const NAVY = "#1B2A4A";
const GOLD = "#F59E0B";

type Tone = "light" | "dark";

/**
 * The CloseBoss mark — six AI employees in a hexagon around the gold BOSS core.
 * Rendered as the generated raster icon so it matches the app / launcher icon
 * exactly (master art in public/brand/realtyboss/). The `tone` prop is accepted
 * for API compatibility but unused (the tile is self-contained).
 */
export function CloseBossMark({ className }: { className?: string; tone?: Tone }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/realtyboss/realtyboss-mark-512.png"
      alt="CloseBoss"
      width={40}
      height={40}
      className={cn("h-8 w-8", className)}
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
 * CloseBoss horizontal lockup — mascot mark + two-tone wordmark (+ tagline).
 * The wordmark renders as text in the app's heading font so it stays crisp and
 * theme-consistent: body indigo (white on dark), "Boss" in the amber accent.
 */
export function CloseBossLogo({ className, compact, tone = "light" }: Props) {
  const body = tone === "dark" ? "#FFFFFF" : NAVY;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <CloseBossMark tone={tone} className={compact ? "h-8 w-8" : "h-10 w-10"} />
      <span className="flex flex-col items-center leading-none">
        <span className={cn("font-heading font-bold tracking-tight", compact ? "text-lg" : "text-2xl")}>
          <span style={{ color: body }}>Close</span>
          <span style={{ color: GOLD }}>Boss</span>
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
