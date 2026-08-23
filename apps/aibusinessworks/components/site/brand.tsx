import { cx } from "@/components/ui/primitives";

/**
 * The mark: an abstract distribution network. A hub with three connected nodes,
 * one of them gold - solutions moving outward through people. No robots, no
 * circuit-board cliches.
 */
export function Mark({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cx("shrink-0", className)}
    >
      <rect width="40" height="40" rx="10" fill="var(--color-navy-900)" />
      <g stroke="var(--color-cyan-accent)" strokeWidth="1.4" strokeLinecap="round" opacity="0.85">
        <path d="M20 20 L11 12.5" />
        <path d="M20 20 L29 13.5" />
        <path d="M20 20 L13.5 29" />
        <path d="M20 20 L28 28.5" />
      </g>
      <circle cx="20" cy="20" r="4" fill="var(--color-cyan-accent)" />
      <circle cx="11" cy="12.5" r="2.4" fill="#fff" opacity="0.92" />
      <circle cx="29" cy="13.5" r="2.4" fill="var(--color-gold-accent)" />
      <circle cx="13.5" cy="29" r="2.4" fill="#fff" opacity="0.92" />
      <circle cx="28" cy="28.5" r="2.4" fill="#fff" opacity="0.92" />
    </svg>
  );
}

export function Wordmark({
  tone = "light",
  showProgram = true,
}: {
  tone?: "light" | "dark";
  showProgram?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark />
      <span className="flex flex-col leading-none">
        <span
          className={cx(
            "font-display text-[0.95rem] font-bold tracking-tight sm:text-base",
            tone === "dark" ? "text-white" : "text-navy-900",
          )}
        >
          AI Business Works
        </span>
        {showProgram ? (
          <span
            className={cx(
              "mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.16em]",
              tone === "dark" ? "text-navy-300" : "text-navy-500",
            )}
          >
            Partner Program
          </span>
        ) : null}
      </span>
    </span>
  );
}
