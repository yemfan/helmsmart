import { PARTNER_LEVELS, type PartnerLevel } from "@/content/levels";
import { cx } from "@/components/ui/primitives";

const RING: Record<PartnerLevel["key"], string> = {
  partner: "text-navy-300",
  builder: "text-navy-400",
  pro_partner: "text-navy-600",
  elite: "text-cyan-accent",
  leader: "text-gold-accent",
};

/**
 * The level badge: a ring whose completed arc grows with the tier, with the
 * Leader tier marked in gold. Restrained on purpose - recognition, not a
 * progress bar in a game.
 */
export function LevelBadge({
  level,
  size = 56,
}: {
  level: PartnerLevel;
  size?: number;
}) {
  const index = PARTNER_LEVELS.findIndex((l) => l.key === level.key);
  const fraction = (index + 1) / PARTNER_LEVELS.length;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      className={cx("shrink-0", RING[level.key])}
      role="img"
      aria-label={`${level.name} level`}
    >
      <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.18" />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${circumference * fraction} ${circumference}`}
        transform="rotate(-90 22 22)"
      />
      <text
        x="22"
        y="22"
        textAnchor="middle"
        dominantBaseline="central"
        className="font-display"
        fontSize="13"
        fontWeight="700"
        fill="currentColor"
      >
        {level.name.charAt(0)}
      </text>
    </svg>
  );
}

export function LevelLadder() {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {PARTNER_LEVELS.map((level) => (
        <li
          key={level.key}
          className={cx(
            "rounded-2xl border p-5",
            level.requiresLeaderQualification
              ? "border-gold-accent/40 bg-gold-soft/50"
              : "border-hairline bg-white shadow-card",
          )}
        >
          <LevelBadge level={level} />
          <h3 className="mt-4 font-display text-base font-semibold tracking-tight text-ink">
            {level.name}
          </h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-navy-500">
            {level.requirement}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">{level.description}</p>
        </li>
      ))}
    </ol>
  );
}
