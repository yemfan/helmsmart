import { RateTile } from "@/components/ui/stat";
import { formatBps, formatMonthsAsYears } from "@/lib/compensation/format";
import type { CompensationRules } from "@/lib/compensation/types";
import { cx } from "@/components/ui/primitives";

/**
 * The headline rate display. Every number comes from the configured plan - if an
 * administrator changes year one to 20%, this strip says 20% everywhere it
 * appears, with no code change.
 */
export function RateStrip({
  rules,
  tone = "dark",
  includeLeadership = true,
}: {
  rules: CompensationRules;
  tone?: "dark" | "light";
  includeLeadership?: boolean;
}) {
  const years = rules.direct.yearRatesBps
    .slice(0, Math.ceil(rules.direct.durationMonths / 12))
    .map((bps, i) => ({ year: i + 1, bps }));

  const overrideBps = rules.leadership.generationRatesBps[0] ?? 0;

  return (
    <div
      className={cx(
        "grid gap-3",
        includeLeadership && overrideBps > 0
          ? "sm:grid-cols-2 lg:grid-cols-4"
          : // Static class names so Tailwind can see them at build time.
            years.length >= 3
            ? "sm:grid-cols-3"
            : years.length === 2
              ? "sm:grid-cols-2"
              : "sm:grid-cols-1",
      )}
    >
      {years.map(({ year, bps }) => (
        <RateTile
          key={year}
          tone={tone}
          value={formatBps(bps)}
          label={`Year ${year}`}
          sublabel={year === 1 ? "of qualifying revenue" : undefined}
        />
      ))}
      {includeLeadership && overrideBps > 0 ? (
        <RateTile
          tone={tone}
          emphasis
          value={formatBps(overrideBps)}
          label="Leadership Override"
          sublabel={`Up to ${formatMonthsAsYears(rules.leadership.durationMonths)} per qualifying customer`}
        />
      ) : null}
    </div>
  );
}

/** "Up to 45% over three years" - computed, never typed. */
export function DirectTotalHeadline({
  rules,
  tone = "light",
}: {
  rules: CompensationRules;
  tone?: "light" | "dark";
}) {
  const yearCount = Math.ceil(rules.direct.durationMonths / 12);
  const totalBps = rules.direct.yearRatesBps
    .slice(0, yearCount)
    .reduce((sum, bps) => sum + bps, 0);

  return (
    <p
      className={cx(
        "font-display text-2xl font-semibold tracking-tight sm:text-3xl",
        tone === "dark" ? "text-white" : "text-ink",
      )}
    >
      Up to {formatBps(totalBps)} over {formatMonthsAsYears(rules.direct.durationMonths)}
    </p>
  );
}
