import { cn } from "@/lib/utils";

// Official palette per docs/branding/realtorboss-theme-constitution.md:
// Primary Navy #0B1F44 (trust, leadership), Boss Gold #D4A017 (use sparingly).
const NAVY = "#0B1F44";
const GOLD = "#D4A017";
// Lighter gold for the connector lines, so the solid nodes + R coin pop.
const GOLD_LIGHT = "#E8CC78";
// Light-blue badge background behind the mark (reads well on white + dark).
const TILE_BG = "#CFE5FA";

type Tone = "light" | "dark";

/** The RealtyBoss mark — a house built from six points: five teammates
 *  wired to a central Boss hub, on a light-blue badge tile. Inline SVG.
 *  Master asset: public/brand/realtorboss/realtorboss-mark.svg
 *  Self-contained (own light-blue background), so it reads on any surface;
 *  the `tone` prop is accepted for API compatibility but no longer needed. */
export function RealtyBossMark({ className }: { className?: string; tone?: Tone }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden className={cn("h-8 w-8", className)}>
      <rect width="200" height="200" rx="44" fill={TILE_BG} />
      <path
        d="M100 46 L52 90 L52 152 L148 152 L148 90 Z"
        fill={NAVY}
        stroke={NAVY}
        strokeWidth={10}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <g stroke={GOLD_LIGHT} strokeWidth={4} opacity={0.85}>
        <line x1="100" y1="112" x2="100" y2="46" />
        <line x1="100" y1="112" x2="52" y2="90" />
        <line x1="100" y1="112" x2="148" y2="90" />
        <line x1="100" y1="112" x2="52" y2="152" />
        <line x1="100" y1="112" x2="148" y2="152" />
      </g>
      <g fill={GOLD}>
        <circle cx="100" cy="46" r="9" />
        <circle cx="52" cy="90" r="9" />
        <circle cx="148" cy="90" r="9" />
        <circle cx="52" cy="152" r="9" />
        <circle cx="148" cy="152" r="9" />
      </g>
      {/* Central hub = gold "R" coin (you, the boss) */}
      <circle cx="100" cy="112" r="23" fill={GOLD} />
      <text
        x="100"
        y="123"
        textAnchor="middle"
        fontFamily="var(--font-heading, Arial, Helvetica, sans-serif)"
        fontWeight={700}
        fontSize={30}
        fill={NAVY}
      >
        R
      </text>
    </svg>
  );
}

type Props = {
  className?: string;
  /** Smaller variant for footers / compact nav (hides the tagline). */
  compact?: boolean;
  /** "dark" renders navy parts white for dark surfaces (e.g. onboarding). */
  tone?: Tone;
};

/**
 * RealtyBoss horizontal lockup — mark + two-tone wordmark (+ tagline).
 * Wordmark renders as text in the app's heading font, so it stays crisp
 * and theme-consistent. Gold is accent-only; the wordmark body is navy
 * (white on dark) for contrast (per brand review).
 */
export function RealtyBossLogo({ className, compact, tone = "light" }: Props) {
  const body = tone === "dark" ? "#FFFFFF" : NAVY;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <RealtyBossMark tone={tone} className={compact ? "h-8 w-8" : "h-10 w-10"} />
      <span className="flex flex-col items-center leading-none">
        <span className={cn("font-heading font-bold tracking-tight", compact ? "text-lg" : "text-2xl")}>
          <span style={{ color: body }}>Realtor</span>
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
