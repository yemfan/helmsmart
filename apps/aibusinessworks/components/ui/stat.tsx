import type { ReactNode } from "react";
import { cx } from "./primitives";

/**
 * The rate tile. Used for the hero's 25 / 10 / 10 and for the Leadership 5.
 * The number is always passed in from configured plan data, never typed here.
 */
export function RateTile({
  value,
  label,
  sublabel,
  tone = "dark",
  emphasis = false,
}: {
  value: string;
  label: string;
  sublabel?: string;
  tone?: "dark" | "light";
  emphasis?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border px-5 py-6 text-center sm:px-6",
        tone === "dark"
          ? emphasis
            ? "border-gold-accent/40 bg-white/[0.06]"
            : "border-white/12 bg-white/[0.04]"
          : emphasis
            ? "border-gold-accent/50 bg-gold-soft"
            : "border-hairline bg-white",
      )}
    >
      <div
        className={cx(
          "font-display text-4xl leading-none font-semibold tracking-tight sm:text-5xl",
          tone === "dark"
            ? emphasis
              ? "text-gold-accent"
              : "text-white"
            : emphasis
              ? "text-[#7a6122]"
              : "text-navy-900",
        )}
      >
        {value}
      </div>
      <div
        className={cx(
          "mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.16em]",
          tone === "dark" ? "text-navy-200" : "text-navy-500",
        )}
      >
        {label}
      </div>
      {sublabel ? (
        <div className={cx("mt-1.5 text-xs", tone === "dark" ? "text-navy-300" : "text-muted")}>
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

/** Dashboard metric tile. */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "positive" | "muted";
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-white p-5 shadow-card">
      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
        {label}
      </div>
      <div
        className={cx(
          "mt-2.5 font-display text-2xl font-semibold tracking-tight sm:text-[1.75rem]",
          tone === "positive" ? "text-emerald-700" : tone === "muted" ? "text-muted" : "text-ink",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const grid =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2 lg:grid-cols-4";
  return <div className={cx("grid grid-cols-1 gap-4", grid)}>{children}</div>;
}
